import pandas as pd
import numpy as np
from sklearn.preprocessing import RobustScaler
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.metrics import mean_squared_error, r2_score, mean_absolute_error
from darts import TimeSeries
from darts.models import RNNModel
from darts.dataprocessing.transformers import Scaler
from pytorch_lightning.callbacks import EarlyStopping
import matplotlib.pyplot as plt

# ======== 1. Đọc dữ liệu và tiền xử lý ========
df = pd.read_csv("C:/Users/luong/OneDrive - Thanglele/O D/64KTPM3/NCKH/code_MapAPI/Map_API/Google-map-distance-api-main/Distance cities/DataTiep.csv")
df = df[['Date', 'Time (HH:mm)', 'Start Lat', 'Start Lng', 'End Lat', 'End Lng', 'Distance (m)', 'Duration (s)']]

# Lọc dữ liệu bất thường
df = df[(df['Distance (m)'] > 100) & (df['Duration (s)'] > 10)]
df = df[df['Duration (s)'] < df['Duration (s)'].quantile(0.99)]
df = df[df['Distance (m)'] < df['Distance (m)'].quantile(0.99)]

# Xử lý đặc trưng thời gian
time_data = pd.to_datetime(df['Time (HH:mm)'], format='%I:%M:%S %p')
df['hour'] = time_data.dt.hour
df['minute'] = time_data.dt.minute
df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24)
df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24)
df['minute_sin'] = np.sin(2 * np.pi * df['minute'] / 60)
df['minute_cos'] = np.cos(2 * np.pi * df['minute'] / 60)

# Xử lý từ Date
df['Date'] = pd.to_datetime(df['Date'], format='%m/%d/%Y')
df['day_of_week'] = df['Date'].dt.dayofweek
df['month'] = df['Date'].dt.month
df['day_of_week_sin'] = np.sin(2 * np.pi * df['day_of_week'] / 7)
df['day_of_week_cos'] = np.cos(2 * np.pi * df['day_of_week'] / 7)
df['month_sin'] = np.sin(2 * np.pi * df['month'] / 12)
df['month_cos'] = np.cos(2 * np.pi * df['month'] / 12)
df['is_weekend'] = df['day_of_week'].isin([5, 6]).astype(int)
df['is_holiday'] = df['Date'].isin(pd.to_datetime(['2025-01-01'])).astype(int)

# Thêm đặc trưng log distance
df['log_distance'] = np.log1p(df['Distance (m)'])

# Chuẩn hóa tọa độ
scaler_coords = RobustScaler()
features_to_scale = ['Start Lat', 'Start Lng', 'End Lat', 'End Lng']
df[features_to_scale] = scaler_coords.fit_transform(df[features_to_scale])

# ======== 2. Tạo TimeSeries cho LSTM ========
df = df.sort_values('Time (HH:mm)').reset_index(drop=True)
df['Regular_TimeIndex'] = pd.date_range(start='2023-01-01', periods=len(df), freq='10T')
duration_series = TimeSeries.from_dataframe(df, time_col='Regular_TimeIndex', value_cols=['Duration (s)'])
scaler = Scaler()
duration_series_scaled = scaler.fit_transform(duration_series)

# Train/Validation Split
train, val = duration_series_scaled.split_before(0.8)

# ======== 3. Huấn luyện mô hình LTSF (LSTM) ========
early_stopping = EarlyStopping(
    monitor="val_loss", patience=5, mode="min", verbose=True
)
model_ltsf = RNNModel(
    model='LSTM',
    input_chunk_length=12,
    output_chunk_length=1,
    hidden_dim=20,
    n_rnn_layers=2,
    n_epochs=100,
    dropout=0.2,
    random_state=42,
    pl_trainer_kwargs={
        "callbacks": [early_stopping],
        "enable_progress_bar": True,
    }
)

model_ltsf.fit(series=train, val_series=val, verbose=True)

# ======== 4. Dự đoán bằng LTSF ========
ltsf_predictions = model_ltsf.predict(len(df))
ltsf_predictions = scaler.inverse_transform(ltsf_predictions)
ltsf_pred_values = ltsf_predictions.pd_dataframe().values.flatten()

# Đảm bảo kích thước khớp
if len(ltsf_pred_values) != len(df):
    ltsf_pred_values = ltsf_pred_values[:len(df)] if len(ltsf_pred_values) > len(df) else \
                       list(ltsf_pred_values) + [ltsf_pred_values[-1]] * (len(df) - len(ltsf_pred_values))

df['LTSF_Predicted_Duration'] = ltsf_pred_values

# ======== 5. Huấn luyện Random Forest ========
feature_columns = features_to_scale + ['log_distance', 'hour_sin', 'hour_cos', 'minute_sin', 'minute_cos',
                                       'day_of_week_sin', 'day_of_week_cos', 'month_sin', 'month_cos',
                                       'is_weekend', 'is_holiday', 'LTSF_Predicted_Duration']
X = df[feature_columns]
y = df['Duration (s)']

# Tách tập train/test
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# GridSearchCV cho Random Forest
param_grid_rf = {
    'n_estimators': [50, 100],
    'max_depth': [5, 10, 15],
    'min_samples_split': [2, 5]
}
grid_search_rf = GridSearchCV(RandomForestRegressor(random_state=42), param_grid_rf, cv=3)
grid_search_rf.fit(X_train, y_train)

# ======== 6. Đánh giá mô hình Random Forest ========
best_rf_model = grid_search_rf.best_estimator_
rf_predictions = best_rf_model.predict(X_test)

# Tính các chỉ số
mse = mean_squared_error(y_test, rf_predictions)
rmse = np.sqrt(mse)
r2 = r2_score(y_test, rf_predictions)
mae = mean_absolute_error(y_test, rf_predictions)  # Tính MAE

print(f"\nEvaluation Metrics:")
print(f"MSE: {mse:.2f}")
print(f"RMSE: {rmse:.2f}")
print(f"R^2 Score: {r2:.4f}")
print(f"MAE: {mae:.2f}")  # In ra MAE

