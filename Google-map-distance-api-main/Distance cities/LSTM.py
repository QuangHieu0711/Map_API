# Import thư viện
import os
import random
import pandas as pd
import numpy as np
import tensorflow as tf
from sklearn.preprocessing import RobustScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense, Dropout, Input, LSTM
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.losses import Huber
import matplotlib.pyplot as plt
import scipy.stats as stats

# Cố định seed
os.environ['PYTHONHASHSEED'] = '42'
random.seed(42)
np.random.seed(42)
tf.random.set_seed(42)
tf.keras.utils.set_random_seed(42)

# Đọc dữ liệu
df = pd.read_csv(r"Google-map-distance-api-main/Distance cities/DataTiep.csv")
df = df[['Date', 'Time (HH:mm)', 'Start Lat', 'Start Lng', 'End Lat', 'End Lng', 'Distance (m)', 'Duration (s)']]

# Lọc dữ liệu
df = df[(df['Distance (m)'] > 100) & (df['Duration (s)'] > 10)]
df = df[df['Duration (s)'] < df['Duration (s)'].quantile(0.99)]
df = df[df['Distance (m)'] < df['Distance (m)'].quantile(0.99)]

# Xử lý đặc trưng thời gian từ Time (HH:mm)
time_data = pd.to_datetime(df['Time (HH:mm)'], format='%I:%M:%S %p') 
df['hour'] = time_data.dt.hour
df['minute'] = time_data.dt.minute
df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24)
df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24)
df['minute_sin'] = np.sin(2 * np.pi * df['minute'] / 60)
df['minute_cos'] = np.cos(2 * np.pi * df['minute'] / 60)

# Xử lý đặc trưng từ Date (MM/dd/YYYY)
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

# Chuẩn hóa đặc trưng
scaler = RobustScaler()
features_to_scale = ['Start Lat', 'Start Lng', 'End Lat', 'End Lng']
df[features_to_scale] = scaler.fit_transform(df[features_to_scale])

# Cập nhật danh sách đặc trưng
features = features_to_scale + ['log_distance', 'hour_sin', 'hour_cos', 'minute_sin', 'minute_cos',
                                'day_of_week_sin', 'day_of_week_cos', 'month_sin', 'month_cos',
                                'is_weekend', 'is_holiday']
X = df[features].values
y = np.log1p(df['Duration (s)'].values)

# Chia dữ liệu
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
X_train, X_val, y_train, y_val = train_test_split(X_train, y_train, test_size=0.2, random_state=42)

# Reshape dữ liệu cho LSTM
X_train_lstm = X_train.reshape((X_train.shape[0], 1, X_train.shape[1]))
X_val_lstm = X_val.reshape((X_val.shape[0], 1, X_val.shape[1]))
X_test_lstm = X_test.reshape((X_test.shape[0], 1, X_test.shape[1]))

# Xây dựng mô hình LSTM (đã điều chỉnh)
model = Sequential([
    Input(shape=(1, X_train.shape[1])),
    LSTM(100, activation='tanh', return_sequences=True),  # Giảm từ 128 xuống 100
    Dropout(0.25),  # Giảm từ 0.3 xuống 0. коэффици
    LSTM(50, activation='tanh'),  # Giảm từ 64 xuống 50
    Dropout(0.25),  # Giảm từ 0.3 xuống 0.25
    Dense(64, activation='relu'),  # Thêm lớp Dense 64
    Dense(32, activation='relu'),
    Dense(16, activation='relu'),
    Dense(1)
])

# Cấu hình optimizer và loss function
optimizer = Adam(learning_rate=0.001)
model.compile(optimizer=optimizer, loss=Huber(delta=1.0))

# Callback
callbacks = [
    EarlyStopping(patience=10, restore_best_weights=True),
    ReduceLROnPlateau(factor=0.2, patience=5)
]

# Huấn luyện mô hình
history = model.fit(
    X_train_lstm, y_train,
    epochs=200,
    batch_size=32,
    validation_data=(X_val_lstm, y_val),
    callbacks=callbacks,
    verbose=1
)

# Dự đoán và đánh giá
y_pred = model.predict(X_test_lstm)
y_test_original = np.expm1(y_test)
y_pred_original = np.expm1(y_pred.flatten())

print("\nĐánh giá mô hình LSTM:")
mae = mean_absolute_error(y_test_original, y_pred_original)
mse = mean_squared_error(y_test_original, y_pred_original)
rmse = np.sqrt(mse)
r2 = r2_score(y_test_original, y_pred_original)
print(f"MAE: {mae:.4f}")
print(f"MSE: {mse:.4f}")
print(f"RMSE: {rmse:.4f}")
print(f"R2: {r2:.4f}")
