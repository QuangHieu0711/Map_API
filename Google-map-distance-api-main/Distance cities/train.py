import os
import random
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense, Dropout, Input, LSTM
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.losses import Huber
from sklearn.preprocessing import RobustScaler
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.ensemble import RandomForestRegressor
from darts import TimeSeries
from darts.models import RNNModel
from darts.dataprocessing.transformers import Scaler
from pytorch_lightning.callbacks import EarlyStopping as PLEarlyStopping
import matplotlib.pyplot as plt

# Cố định hạt giống ngẫu nhiên để đảm bảo kết quả có thể tái lập
os.environ['PYTHONHASHSEED'] = '42'
random.seed(42)
np.random.seed(42)
tf.random.set_seed(42)
torch.manual_seed(42)

# ----------- Tiền xử lý dữ liệu (Chung cho tất cả mô hình) -----------
# Ghi chú: Hàm này đọc file CSV, lọc dữ liệu, tạo đặc trưng và chuẩn hóa tọa độ
def preprocess_data(filepath):
    # Đọc file CSV
    df = pd.read_csv(filepath)
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

    # Xử lý đặc trưng ngày tháng
    df['Date'] = pd.to_datetime(df['Date'], format='%m/%d/%Y')
    df['day_of_week'] = df['Date'].dt.dayofweek
    df['month'] = df['Date'].dt.month
    df['day_of_week_sin'] = np.sin(2 * np.pi * df['day_of_week'] / 7)
    df['day_of_week_cos'] = np.cos(2 * np.pi * df['day_of_week'] / 7)
    df['month_sin'] = np.sin(2 * np.pi * df['month'] / 12)
    df['month_cos'] = np.cos(2 * np.pi * df['month'] / 12)
    df['is_weekend'] = df['day_of_week'].isin([5, 6]).astype(int)
    df['is_holiday'] = df['Date'].isin(pd.to_datetime(['2025-01-01'])).astype(int)

    # Biến đổi log cho khoảng cách và thời gian
    df['log_distance'] = np.log1p(df['Distance (m)'])
    df['log_duration'] = np.log1p(df['Duration (s)'])

    # Chuẩn hóa tọa độ
    scaler = RobustScaler()
    features_to_scale = ['Start Lat', 'Start Lng', 'End Lat', 'End Lng']
    df[features_to_scale] = scaler.fit_transform(df[features_to_scale])

    return df, scaler

# ----------- Hàm đánh giá mô hình -----------
# Ghi chú: Tính các chỉ số MAE, MSE, RMSE, R2 nhưng không in ngay
def evaluate_model(y_true, y_pred):
    mae = mean_absolute_error(y_true, y_pred)
    mse = mean_squared_error(y_true, y_pred)
    rmse = np.sqrt(mse)
    r2 = r2_score(y_true, y_pred)
    return {'MAE': mae, 'MSE': mse, 'RMSE': rmse, 'R2': r2}

# ----------- Chia dữ liệu (Chung cho LSTM và TFT) -----------
# Ghi chú: Chia dữ liệu thành tập huấn luyện, kiểm tra, xác thực với cùng đặc trưng
def split_data(df):
    features = ['Start Lat', 'Start Lng', 'End Lat', 'End Lng', 'log_distance',
                'hour_sin', 'hour_cos', 'minute_sin', 'minute_cos',
                'day_of_week_sin', 'day_of_week_cos', 'month_sin', 'month_cos',
                'is_weekend', 'is_holiday']
    X = df[features].values
    y = df['log_duration'].values
    y_orig = df['Duration (s)'].values  # Dùng cho LTSF + Random Forest
    X_train, X_test, y_train, y_test, y_orig_train, y_orig_test = train_test_split(
        X, y, y_orig, test_size=0.2, random_state=42)
    X_train, X_val, y_train, y_val = train_test_split(X_train, y_train, test_size=0.2, random_state=42)
    return X_train, X_test, X_val, y_train, y_test, y_val, y_orig_train, y_orig_test, features

# ----------- Mô hình LSTM -----------
# Ghi chú: Huấn luyện LSTM với dữ liệu đã chia, dự đoán log_duration
def train_lstm_model(X_train, X_test, X_val, y_train, y_test, y_val, features):
    # Định dạng lại dữ liệu cho LSTM
    X_train_lstm = X_train.reshape((X_train.shape[0], 1, len(features)))
    X_val_lstm = X_val.reshape((X_val.shape[0], 1, len(features)))
    X_test_lstm = X_test.reshape((X_test.shape[0], 1, len(features)))

    # Xây dựng và huấn luyện mô hình LSTM
    model = Sequential([
        Input(shape=(1, len(features))),
        LSTM(100, activation='tanh', return_sequences=True),
        Dropout(0.25),
        LSTM(50, activation='tanh'),
        Dropout(0.25),
        Dense(64, activation='relu'),
        Dense(32, activation='relu'),
        Dense(16, activation='relu'),
        Dense(1)
    ])
    model.compile(optimizer=Adam(learning_rate=0.001), loss=Huber(delta=1.0))
    model.fit(X_train_lstm, y_train, epochs=200, batch_size=32,
              validation_data=(X_val_lstm, y_val),
              callbacks=[EarlyStopping(patience=10, restore_best_weights=True),
                         ReduceLROnPlateau(factor=0.2, patience=5)],
              verbose=1)

    # Dự đoán
    y_pred = model.predict(X_test_lstm, verbose=0).flatten()
    y_test_orig = np.expm1(y_test)
    y_pred_orig = np.expm1(y_pred)
    return evaluate_model(y_test_orig, y_pred_orig), y_test_orig, y_pred_orig

# ----------- Mô hình LTSF + Random Forest -----------
# Ghi chú: LTSF dự đoán chuỗi thời gian, Random Forest tinh chỉnh với đặc trưng bổ sung
def train_ltsf_rf_model(df, features):
    # Chuẩn bị dữ liệu cho LTSF
    df_sorted = df.sort_values('Time (HH:mm)').reset_index(drop=True)
    df_sorted['Regular_TimeIndex'] = pd.date_range(start='2023-01-01', periods=len(df_sorted), freq='10T')
    duration_series = TimeSeries.from_dataframe(df_sorted, time_col='Regular_TimeIndex', value_cols=['Duration (s)'])
    scaler = Scaler()
    duration_series_scaled = scaler.fit_transform(duration_series)

    # Chia dữ liệu giữ nguyên thứ tự thời gian
    train, test = duration_series_scaled.split_before(0.8)

    # Huấn luyện LTSF
    model_ltsf = RNNModel(
        model='LSTM', input_chunk_length=12, output_chunk_length=1,
        hidden_dim=20, n_rnn_layers=2, n_epochs=100, dropout=0.2, random_state=42,
        pl_trainer_kwargs={"callbacks": [PLEarlyStopping(monitor="val_loss", patience=5, mode="min")]}
    )
    model_ltsf.fit(series=train, val_series=test, verbose=True)

    # Dự đoán LTSF cho toàn bộ dữ liệu
    ltsf_pred = scaler.inverse_transform(model_ltsf.predict(len(df_sorted))).pd_dataframe().values.flatten()
    if len(ltsf_pred) != len(df_sorted):
        ltsf_pred = ltsf_pred[:len(df_sorted)] if len(ltsf_pred) > len(df_sorted) else \
                    np.pad(ltsf_pred, (0, len(df_sorted) - len(ltsf_pred)), mode='edge')
    df_sorted['LTSF_Predicted_Duration'] = ltsf_pred

    # Chia lại dữ liệu để khớp với train/test của các mô hình khác
    train_size = int(0.8 * len(df_sorted))
    df_train = df_sorted.iloc[:train_size]
    df_test = df_sorted.iloc[train_size:]

    # Random Forest với đặc trưng chung + LTSF prediction
    rf_features = features + ['LTSF_Predicted_Duration']
    X_train_rf = df_train[rf_features].values
    X_test_rf = df_test[rf_features].values
    y_train_rf = df_train['Duration (s)'].values
    y_test_rf = df_test['Duration (s)'].values

    grid_search = GridSearchCV(RandomForestRegressor(random_state=42),
                              param_grid={'n_estimators': [50, 100], 'max_depth': [5, 10, 15], 'min_samples_split': [2, 5]},
                              cv=3)
    grid_search.fit(X_train_rf, y_train_rf)
    y_pred = grid_search.best_estimator_.predict(X_test_rf)

    return evaluate_model(y_test_rf, y_pred), y_test_rf, y_pred

# ----------- Mô hình Enhanced TFT -----------
# Ghi chú: Mô hình Transformer tùy chỉnh, dự đoán log_duration với chuỗi thời gian ngắn
class EnhancedTFT(nn.Module):
    def __init__(self, input_size, hidden_size=128, dropout=0.1):
        super().__init__()
        self.hidden_size = hidden_size
        self.feature_embedding = nn.Linear(input_size, hidden_size)
        self.query = nn.Linear(hidden_size, hidden_size)
        self.key = nn.Linear(hidden_size, hidden_size)
        self.value = nn.Linear(hidden_size, hidden_size)
        self.transform = nn.Sequential(
            nn.Linear(hidden_size, hidden_size * 2),
            nn.GLU(),
            nn.LayerNorm(hidden_size),
            nn.Dropout(dropout)
        )
        self.output = nn.Sequential(
            nn.Linear(hidden_size, hidden_size),
            nn.ReLU(),
            nn.Linear(hidden_size, 1)
        )

    def forward(self, x):
        x = self.feature_embedding(x)
        q = self.query(x)
        k = self.key(x)
        v = self.value(x)
        attn_weights = torch.softmax(torch.matmul(q, k.transpose(-2, -1)) / (self.hidden_size ** 0.5), dim=-1)
        x = torch.matmul(attn_weights, v)
        x = self.transform(x)
        x = x[:, -1, :]
        return self.output(x)

def train_tft_model(X_train, X_test, y_train, y_test, features, seq_len=5):
    # Tạo chuỗi dữ liệu
    def create_sequences(X, y, seq_len):
        X_seq = np.zeros((len(X) - seq_len + 1, seq_len, X.shape[1]), dtype=np.float32)
        y_seq = np.zeros((len(X) - seq_len + 1,), dtype=np.float32)
        for i in range(len(X) - seq_len + 1):
            X_seq[i] = X[i:i + seq_len]
            y_seq[i] = y[i + seq_len - 1]
        return torch.from_numpy(X_seq), torch.from_numpy(y_seq)

    X_train_seq, y_train_seq = create_sequences(X_train, y_train, seq_len)
    X_test_seq, y_test_seq = create_sequences(X_test, y_test, seq_len)

    # Tạo DataLoader
    train_loader = DataLoader(TensorDataset(X_train_seq, y_train_seq), batch_size=64, shuffle=True)
    test_loader = DataLoader(TensorDataset(X_test_seq, y_test_seq), batch_size=64)

    # Huấn luyện TFT
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = EnhancedTFT(input_size=len(features)).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.001, weight_decay=1e-5)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=5, factor=0.5)
    criterion = nn.HuberLoss()

    best_r2 = -float('inf')
    for epoch in range(100):
        model.train()
        epoch_loss = 0.0
        for X_batch, y_batch in train_loader:
            X_batch, y_batch = X_batch.to(device), y_batch.to(device)
            optimizer.zero_grad()
            outputs = model(X_batch)
            loss = criterion(outputs, y_batch.unsqueeze(1))
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            epoch_loss += loss.item()

        model.eval()
        y_true, y_pred = [], []
        with torch.no_grad():
            for X_batch, y_batch in test_loader:
                X_batch = X_batch.to(device)
                outputs = model(X_batch)
                y_true.append(y_batch.cpu().numpy())
                y_pred.append(outputs.squeeze().cpu().numpy())
        y_true = np.concatenate(y_true)
        y_pred = np.concatenate(y_pred)
        r2 = r2_score(np.expm1(y_true), np.expm1(y_pred))
        if r2 > best_r2:
            best_r2 = r2
            torch.save(model.state_dict(), 'best_tft.pth')
        scheduler.step(epoch_loss / len(train_loader))

    # Đánh giá cuối
    model.load_state_dict(torch.load('best_tft.pth'))
    model.eval()
    y_true, y_pred = [], []
    with torch.no_grad():
        for X_batch, y_batch in test_loader:
            X_batch = X_batch.to(device)
            outputs = model(X_batch)
            y_true.append(y_batch.cpu().numpy())
            y_pred.append(outputs.squeeze().cpu().numpy())
    y_true = np.expm1(np.concatenate(y_true))
    y_pred = np.expm1(np.concatenate(y_pred))

    return evaluate_model(y_true, y_pred), y_true, y_pred

# ----------- Hiển thị kết quả -----------
# Ghi chú: In kết quả và vẽ biểu đồ scatter với chấm màu xanh sau khi tất cả mô hình huấn luyện xong
def display_results(results, y_true_dict, y_pred_dict):
    print("\nKết quả cuối cùng:")
    for model, metrics in results.items():
        print(f"{model}:")
        print(f"  MAE: {metrics['MAE']:.2f}")
        print(f"  MSE: {metrics['MSE']:.2f}")
        print(f"  RMSE: {metrics['RMSE']:.2f}")
        print(f"  R2: {metrics['R2']:.4f}")

    # Vẽ biểu đồ
    plt.figure(figsize=(15, 5))
    for i, model in enumerate(['LSTM', 'LTSF + Random Forest', 'Enhanced TFT'], 1):
        plt.subplot(1, 3, i)
        y_true = y_true_dict[model]
        y_pred = y_pred_dict[model]
        plt.scatter(y_true / 60, y_pred / 60, color='blue', alpha=0.3)  # Chấm màu xanh
        plt.plot([min(y_true) / 60, max(y_true) / 60], [min(y_true) / 60, max(y_true) / 60], 'r--')
        plt.xlabel("Thời gian thực tế (phút)")
        plt.ylabel("Thời gian dự đoán (phút)")
        plt.title(f"{model} (R² = {results[model]['R2']:.3f})")
    plt.tight_layout()
    plt.savefig("so_sanh_mo_hinh.png")
    plt.show()

# ----------- Thực thi chính -----------
# Ghi chú: Tiền xử lý, chia dữ liệu, huấn luyện tất cả mô hình, sau đó hiển thị kết quả
if __name__ == "__main__":
    print("Đang tiền xử lý dữ liệu...")
    df, scaler = preprocess_data("Google-map-distance-api-main/Distance cities/DataTiep.csv")

    print("Đang chia dữ liệu...")
    X_train, X_test, X_val, y_train, y_test, y_val, y_orig_train, y_orig_test, features = split_data(df)

    results = {}
    y_true_dict = {}
    y_pred_dict = {}

    print("Đang huấn luyện mô hình LSTM...")
    results['LSTM'], y_true_dict['LSTM'], y_pred_dict['LSTM'] = train_lstm_model(
        X_train, X_test, X_val, y_train, y_test, y_val, features)

    print("Đang huấn luyện mô hình LTSF + Random Forest...")
    results['LTSF + Random Forest'], y_true_dict['LTSF + Random Forest'], y_pred_dict['LTSF + Random Forest'] = train_ltsf_rf_model(
        df.copy(), features)

    print("Đang huấn luyện mô hình Enhanced TFT...")
    results['Enhanced TFT'], y_true_dict['Enhanced TFT'], y_pred_dict['Enhanced TFT'] = train_tft_model(
        X_train, X_test, y_train, y_test, features)

    print("Tất cả mô hình đã huấn luyện xong. Đang hiển thị kết quả...")
    display_results(results, y_true_dict, y_pred_dict)