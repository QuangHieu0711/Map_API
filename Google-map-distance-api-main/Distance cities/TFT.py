import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.preprocessing import RobustScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import matplotlib.pyplot as plt
from math import radians, sin, cos, sqrt, asin

# ----------- Tiền xử lý dữ liệu -----------
def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat/2)**2 + cos(lat1)*cos(lat2)*sin(dlon/2)**2
    return 2 * R * asin(sqrt(a)) * 1000  # in meters

def preprocess_data(filepath):
    df = pd.read_csv(filepath)

    # Lọc và chọn cột
    df = df[['Date', 'Time (HH:mm)', 'Start Lat', 'Start Lng', 'End Lat', 'End Lng', 'Distance (m)', 'Duration (s)']]
    df = df[(df['Distance (m)'] > 100) & (df['Duration (s)'] > 10)]
    df = df[df['Duration (s)'] < df['Duration (s)'].quantile(0.99)]
    df = df[df['Distance (m)'] < df['Distance (m)'].quantile(0.99)]

    # Thời gian
    time_data = pd.to_datetime(df['Time (HH:mm)'], format='%I:%M:%S %p')
    df['hour'] = time_data.dt.hour
    df['minute'] = time_data.dt.minute
    df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24)
    df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24)
    df['minute_sin'] = np.sin(2 * np.pi * df['minute'] / 60)
    df['minute_cos'] = np.cos(2 * np.pi * df['minute'] / 60)

    # Ngày
    df['Date'] = pd.to_datetime(df['Date'], format='%m/%d/%Y')
    df['day_of_week'] = df['Date'].dt.dayofweek
    df['month'] = df['Date'].dt.month
    df['day_of_week_sin'] = np.sin(2 * np.pi * df['day_of_week'] / 7)
    df['day_of_week_cos'] = np.cos(2 * np.pi * df['day_of_week'] / 7)
    df['month_sin'] = np.sin(2 * np.pi * df['month'] / 12)
    df['month_cos'] = np.cos(2 * np.pi * df['month'] / 12)
    df['is_weekend'] = df['day_of_week'].isin([5, 6]).astype(int)
    df['is_holiday'] = df['Date'].isin(pd.to_datetime(['2025-01-01'])).astype(int)

    # Log-transform
    df['log_distance'] = np.log1p(df['Distance (m)'])
    df['log_duration'] = np.log1p(df['Duration (s)'])

    # Scale
    scaler = RobustScaler()
    features_to_scale = ['Start Lat', 'Start Lng', 'End Lat', 'End Lng']
    df[features_to_scale] = scaler.fit_transform(df[features_to_scale])

    return df, scaler

# ----------- Mô hình TFT đơn giản -----------
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

# ----------- Huấn luyện và đánh giá -----------
def train_and_evaluate(df, seq_len=5):
    features = ['Start Lat', 'Start Lng', 'End Lat', 'End Lng', 'log_distance',
                'hour_sin', 'hour_cos', 'minute_sin', 'minute_cos']
    X = df[features].values
    y = df['log_duration'].values

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    def create_sequences(X, y, seq_len):
        X_seq, y_seq = [], []
        for i in range(len(X) - seq_len + 1):
            X_seq.append(X[i:i + seq_len])
            y_seq.append(y[i + seq_len - 1])
        return torch.FloatTensor(X_seq), torch.FloatTensor(y_seq)

    X_train_seq, y_train_seq = create_sequences(X_train, y_train, seq_len)
    X_test_seq, y_test_seq = create_sequences(X_test, y_test, seq_len)

    train_loader = DataLoader(TensorDataset(X_train_seq, y_train_seq), batch_size=64, shuffle=True)
    test_loader = DataLoader(TensorDataset(X_test_seq, y_test_seq), batch_size=64)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = EnhancedTFT(input_size=len(features)).to(device)

    optimizer = torch.optim.AdamW(model.parameters(), lr=0.001, weight_decay=1e-5)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=5, factor=0.5, verbose=True)
    criterion = nn.HuberLoss()

    best_r2 = -np.inf
    train_losses, val_losses = [], []

    for epoch in range(100):
        model.train()
        epoch_loss = 0
        for X_batch, y_batch in train_loader:
            X_batch, y_batch = X_batch.to(device), y_batch.to(device)
            optimizer.zero_grad()
            outputs = model(X_batch)
            loss = criterion(outputs, y_batch.unsqueeze(1))
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            epoch_loss += loss.item()
        train_losses.append(epoch_loss / len(train_loader))

        # Validation
        model.eval()
        y_true, y_pred = [], []
        with torch.no_grad():
            for X_batch, y_batch in test_loader:
                X_batch = X_batch.to(device)
                outputs = model(X_batch)
                y_true.append(y_batch.numpy())
                y_pred.append(outputs.squeeze().cpu().numpy())
        y_true = np.concatenate(y_true)
        y_pred = np.concatenate(y_pred)
        r2 = r2_score(np.expm1(y_true), np.expm1(y_pred))
        val_loss = criterion(torch.tensor(y_pred), torch.tensor(y_true)).item()
        val_losses.append(val_loss)
        if r2 > best_r2:
            best_r2 = r2
            torch.save(model.state_dict(), 'best_model.pth')
        scheduler.step(val_loss)
        print(f"Epoch {epoch+1}: Train Loss = {train_losses[-1]:.4f}, Val Loss = {val_loss:.4f}, R² = {r2:.4f}")

    # Đánh giá cuối
    model.load_state_dict(torch.load('best_model.pth'))
    model.eval()
    with torch.no_grad():
        y_true, y_pred = [], []
        for X_batch, y_batch in test_loader:
            X_batch = X_batch.to(device)
            outputs = model(X_batch)
            y_true.append(y_batch.numpy())
            y_pred.append(outputs.squeeze().cpu().numpy())
    y_true = np.expm1(np.concatenate(y_true))
    y_pred = np.expm1(np.concatenate(y_pred))

    results = {
        'MAE': mean_absolute_error(y_true, y_pred),
        'RMSE': np.sqrt(mean_squared_error(y_true, y_pred)),
        'R2': r2_score(y_true, y_pred)
    }

    plt.figure(figsize=(12, 5))
    plt.subplot(1, 2, 1)
    plt.plot(train_losses, label='Train Loss')
    plt.plot(val_losses, label='Validation Loss')
    plt.legend()
    plt.title("Loss History")

    plt.subplot(1, 2, 2)
    plt.scatter(y_true/60, y_pred/60, alpha=0.3)
    plt.plot([min(y_true)/60, max(y_true)/60], [min(y_true)/60, max(y_true)/60], 'r--')
    plt.xlabel("Actual Duration (min)")
    plt.ylabel("Predicted Duration (min)")
    plt.title(f"Prediction (R² = {results['R2']:.3f})")
    plt.tight_layout()
    plt.savefig("results.png")
    plt.show()

    return results

# ----------- Thực thi chương trình -----------
if __name__ == "__main__":
    print("Đang tiền xử lý dữ liệu...")
    df, scaler = preprocess_data("DataMapCon.csv")
    print("Bắt đầu huấn luyện mô hình...")
    results = train_and_evaluate(df)
    print("\nKết quả cuối cùng:")
    print(f"MAE: {results['MAE']:.2f}")
    print(f"RMSE: {results['RMSE']:.2f}")
    print(f"R2: {results['R2']:.3f}")
