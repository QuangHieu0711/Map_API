import pandas as pd
import numpy as np
from sklearn.preprocessing import RobustScaler
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from darts import TimeSeries
from darts.models import RNNModel
from darts.dataprocessing.transformers import Scaler
from pytorch_lightning.callbacks import EarlyStopping
import joblib
import sklearn

# Log phiên bản sklearn
print(f"scikit-learn version: {sklearn.__version__}")

# Đọc và tiền xử lý dữ liệu
df = pd.read_csv("DataMap_5.csv")
df = df[['Date', 'Time (HH:mm)', 'Start Lat', 'Start Lng', 'End Lat', 'End Lng', 'Distance (m)', 'Traffic Duration (s)']]
df = df[(df['Distance (m)'] > 100) & (df['Traffic Duration (s)'] > 10)]
df = df[df['Traffic Duration (s)'] < df['Traffic Duration (s)'].quantile(0.99)]
df = df[df['Distance (m)'] < df['Distance (m)'].quantile(0.99)]

# Xử lý thời gian
time_data = pd.to_datetime(df['Time (HH:mm)'], format='%I:%M:%S %p')
df['hour'] = time_data.dt.hour
df['minute'] = time_data.dt.minute
df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24)
df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24)
df['minute_sin'] = np.sin(2 * np.pi * df['minute'] / 60)
df['minute_cos'] = np.cos(2 * np.pi * df['minute'] / 60)
df['is_peak_hour'] = np.where((df['hour'] >= 7) & (df['hour'] <= 9) | (df['hour'] >= 17) & (df['hour'] <= 19), 1, 0)

# Xử lý ngày tháng
df['Date'] = pd.to_datetime(df['Date'], format='%m/%d/%Y')
df['day_of_week'] = df['Date'].dt.dayofweek
df['day_of_week_sin'] = np.sin(2 * np.pi * df['day_of_week'] / 7)
df['day_of_week_cos'] = np.cos(2 * np.pi * df['day_of_week'] / 7)
df['is_weekend'] = df['day_of_week'].isin([5, 6]).astype(int)
df['is_holiday'] = df['Date'].isin(pd.to_datetime(['2025-01-01', '2025-01-02'])).astype(int)

# Thêm đặc trưng mới
df['log_distance'] = np.log1p(df['Distance (m)'])
df['congestion_index'] = df['Traffic Duration (s)'] / (df['Distance (m)'] / 1000)
df['euclidean_distance'] = np.sqrt((df['End Lat'] - df['Start Lat'])**2 + (df['End Lng'] - df['Start Lng'])**2) * 111

# Điều chỉnh dữ liệu giờ cao điểm (tốc độ > 40 km/h)
df_peak = df[df['is_peak_hour'] == 1].copy()
for idx, row in df_peak.iterrows():
    distance_km = row['Distance (m)'] / 1000
    speed = (distance_km / (row['Traffic Duration (s)'] / 3600))
    if speed > 40:  # Nếu tốc độ > 40 km/h, điều chỉnh
        speed = np.random.uniform(20, 30)  # Tốc độ 20-30 km/h
        traffic_duration = (distance_km / speed) * 3600
        df_peak.loc[idx, 'Traffic Duration (s)'] = traffic_duration
df.loc[df['is_peak_hour'] == 1, 'Traffic Duration (s)'] = df_peak['Traffic Duration (s)']

# Tăng trọng số cho giờ cao điểm
df_peak_weighted = df[df['is_peak_hour'] == 1].copy()
df = pd.concat([df, df_peak_weighted, df_peak_weighted], ignore_index=True)  # Lặp lại 2 lần

# Chuẩn hóa tọa độ
scaler_coords = RobustScaler()
features_to_scale = ['Start Lat', 'Start Lng', 'End Lat', 'End Lng']
df[features_to_scale] = scaler_coords.fit_transform(df[features_to_scale])
joblib.dump(scaler_coords, "scaler_coords.pkl")

# Chuẩn bị TimeSeries cho LTSF
df = df.sort_values('Time (HH:mm)').reset_index(drop=True)
df['Regular_TimeIndex'] = pd.date_range(start='2023-01-01', periods=len(df), freq='10T')
duration_series = TimeSeries.from_dataframe(df, time_col='Regular_TimeIndex', value_cols=['Traffic Duration (s)'])
scaler = Scaler()
duration_series_scaled = scaler.fit_transform(duration_series)
joblib.dump(scaler, "scaler_timeseries.pkl")

train, val = duration_series_scaled.split_before(0.8)

# Huấn luyện LTSF
early_stopping = EarlyStopping(monitor="val_loss", patience=5, mode="min", verbose=True)
model_ltsf = RNNModel(
    model='LSTM',
    input_chunk_length=12,
    output_chunk_length=1,
    hidden_dim=20,
    n_rnn_layers=2,
    n_epochs=30,
    dropout=0.4,
    random_state=42,
    pl_trainer_kwargs={"callbacks": [early_stopping], "enable_progress_bar": True}
)
model_ltsf.fit(series=train, val_series=val, verbose=True)
model_ltsf.save("ltsf_model.pt")

# Huấn luyện Random Forest
feature_columns = features_to_scale + ['log_distance', 'hour_sin', 'hour_cos', 'minute_sin', 'minute_cos',
                                      'day_of_week_sin', 'day_of_week_cos', 'is_weekend', 'is_holiday',
                                      'congestion_index', 'euclidean_distance', 'is_peak_hour']
X = df[feature_columns]
y = df['Traffic Duration (s)']
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

param_grid_rf = {'n_estimators': [50, 100], 'max_depth': [3, 5, 7], 'min_samples_split': [5, 10], 'max_features': ['sqrt', 'log2']}
grid_search_rf = GridSearchCV(RandomForestRegressor(random_state=42), param_grid_rf, cv=3)
grid_search_rf.fit(X_train, y_train)

# Đánh giá trên tập kiểm tra
y_pred = grid_search_rf.best_estimator_.predict(X_test)
print("MAE on test set:", mean_absolute_error(y_test, y_pred))
print("MSE on test set:", mean_squared_error(y_test, y_pred))
print("RMSE on test set:", np.sqrt(mean_squared_error(y_test, y_pred)))
print("R2 on test set:", r2_score(y_test, y_pred))

# Lưu Random Forest
joblib.dump(grid_search_rf.best_estimator_, "random_forest_model.pkl")

print("Đã lưu các mô hình và scaler!")