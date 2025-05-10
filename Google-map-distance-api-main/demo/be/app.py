from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import numpy as np
import joblib
from sklearn.ensemble import RandomForestRegressor
from darts import TimeSeries
from darts.models import RNNModel
from darts.dataprocessing.transformers import Scaler
import logging
import sklearn

app = FastAPI()

# Cấu hình CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cấu hình logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Log phiên bản sklearn
logger.info(f"scikit-learn version: {sklearn.__version__}")

# Load mô hình và scaler
try:
    random_forest_model = joblib.load("random_forest_model.pkl")
    # Kiểm tra xem random_forest_model có phải là RandomForestRegressor không
    if not isinstance(random_forest_model, RandomForestRegressor):
        raise ValueError("Loaded model is not a RandomForestRegressor")
    logger.info("RandomForest model loaded successfully")
except Exception as e:
    logger.error(f"Error loading RandomForest model: {str(e)}")
    raise Exception(f"Failed to load RandomForest model: {str(e)}")

scaler_coords = joblib.load("scaler_coords.pkl")
scaler_timeseries = joblib.load("scaler_timeseries.pkl")
ltsf_model = RNNModel.load("ltsf_model.pt")

# Định nghĩa lớp dữ liệu đầu vào
class RouteData(BaseModel):
    start_lat: float
    start_lng: float
    end_lat: float
    end_lng: float
    distance_m: float
    date: str
    time: str

# API kiểm tra trạng thái
@app.get("/health")
async def health_check():
    return {"status": "OK"}

# Hàm chuẩn hóa tọa độ
def scale_coords(start_lat, start_lng, end_lat, end_lng):
    coords_df = pd.DataFrame([[start_lat, start_lng, end_lat, end_lng]], 
                             columns=['Start Lat', 'Start Lng', 'End Lat', 'End Lng'])
    scaled_coords = scaler_coords.transform(coords_df)
    logger.info(f"Scaled coords shape: {scaled_coords.shape}, Values: {scaled_coords}")
    return scaled_coords[0]  # Trả về mảng 1D với 4 giá trị

# Hàm tính các đặc trưng thời gian
def extract_time_features(date, time):
    date_time = pd.to_datetime(f"{date} {time}")
    hour = date_time.hour
    minute = date_time.minute
    day_of_week = date_time.dayofweek

    hour_sin = np.sin(2 * np.pi * hour / 24)
    hour_cos = np.cos(2 * np.pi * hour / 24)
    minute_sin = np.sin(2 * np.pi * minute / 60)
    minute_cos = np.cos(2 * np.pi * minute / 60)
    day_of_week_sin = np.sin(2 * np.pi * day_of_week / 7)
    day_of_week_cos = np.cos(2 * np.pi * day_of_week / 7)

    is_peak_hour = 1 if (hour >= 7 and hour <= 9) or (hour >= 17 and hour <= 19) else 0
    is_weekend = 1 if day_of_week >= 5 else 0
    is_holiday = 1 if date in ["2025-01-01", "2025-01-02"] else 0

    return {
        "hour_sin": hour_sin,
        "hour_cos": hour_cos,
        "minute_sin": minute_sin,
        "minute_cos": minute_cos,
        "day_of_week_sin": day_of_week_sin,
        "day_of_week_cos": day_of_week_cos,
        "is_peak_hour": is_peak_hour,
        "is_weekend": is_weekend,
        "is_holiday": is_holiday
    }

# Hàm tính các đặc trưng khoảng cách
def extract_distance_features(start_lat, start_lng, end_lat, end_lng, distance_m):
    log_distance = np.log1p(distance_m)
    euclidean_distance = np.sqrt((end_lat - start_lat)**2 + (end_lng - start_lng)**2) * 111
    return {"log_distance": log_distance, "euclidean_distance": euclidean_distance}

# API dự đoán thời gian
@app.post("/predict")
async def predict(data: RouteData):
    try:
        # Chuẩn hóa tọa độ
        scaled_coords = scale_coords(data.start_lat, data.start_lng, data.end_lat, data.end_lng)
        scaled_start_lat, scaled_start_lng, scaled_end_lat, scaled_end_lng = scaled_coords

        # Tính các đặc trưng thời gian
        time_features = extract_time_features(data.date, data.time)

        # Tính các đặc trưng khoảng cách
        distance_features = extract_distance_features(data.start_lat, data.start_lng, data.end_lat, data.end_lng, data.distance_m)

        # Tính congestion_index (giả định trung bình từ dữ liệu huấn luyện)
        congestion_index = data.distance_m / 8.33  # 30 km/h = 8.33 m/s

        # Định nghĩa tên các đặc trưng
        feature_columns = [
            'Start Lat', 'Start Lng', 'End Lat', 'End Lng',
            'log_distance', 'hour_sin', 'hour_cos', 'minute_sin', 'minute_cos',
            'day_of_week_sin', 'day_of_week_cos', 'is_weekend', 'is_holiday',
            'congestion_index', 'euclidean_distance', 'is_peak_hour'
        ]

        # Kết hợp các đặc trưng
        features = [
            scaled_start_lat,
            scaled_start_lng,
            scaled_end_lat,
            scaled_end_lng,
            distance_features["log_distance"],
            time_features["hour_sin"],
            time_features["hour_cos"],
            time_features["minute_sin"],
            time_features["minute_cos"],
            time_features["day_of_week_sin"],
            time_features["day_of_week_cos"],
            time_features["is_weekend"],
            time_features["is_holiday"],
            congestion_index,
            distance_features["euclidean_distance"],
            time_features["is_peak_hour"]
        ]

        # Chuyển features thành DataFrame
        features_df = pd.DataFrame([features], columns=feature_columns)
        logger.info(f"Features DataFrame shape: {features_df.shape}")
        logger.info(f"Features DataFrame columns: {features_df.columns.tolist()}")
        logger.info(f"Features DataFrame values: {features_df.iloc[0].to_dict()}")

        # Dự đoán với Random Forest
        rf_prediction = random_forest_model.predict(features_df)[0]
        logger.info(f"RandomForest prediction: {rf_prediction}")

        # Dự đoán với LTSF
        time_series_data = np.array([rf_prediction] * 12)  # Chuyển đổi list thành numpy array
        series = TimeSeries.from_values(time_series_data)
        scaled_series = scaler_timeseries.transform(series)
        ltsf_prediction = ltsf_model.predict(n=1, series=scaled_series)
        ltsf_value = ltsf_prediction.values()[0]  # Lấy giá trị dự đoán
        logger.info(f"LTSF prediction value (raw): {ltsf_value}")

        # Đảm bảo ltsf_value là scalar hoặc mảng 1D
        ltsf_value_scalar = float(ltsf_value) if isinstance(ltsf_value, (np.ndarray, list)) and len(np.shape(ltsf_value)) > 0 else ltsf_value
        ltsf_value_array = np.array([ltsf_value_scalar])  # Chuyển thành mảng 1D
        logger.info(f"LTSF value after conversion: {ltsf_value_array}")

        # Tạo TimeSeries từ ltsf_value_array
        ltsf_series = TimeSeries.from_values(ltsf_value_array)
        final_ltsf_prediction = scaler_timeseries.inverse_transform(ltsf_series).values()[0]
        logger.info(f"Final LTSF prediction (after inverse transform): {final_ltsf_prediction}")

        # Kết hợp dự đoán
        final_ltsf_prediction_scalar = float(final_ltsf_prediction) if isinstance(final_ltsf_prediction, (np.ndarray, list)) else final_ltsf_prediction
        predicted_duration = 0.7 * rf_prediction + 0.3 * final_ltsf_prediction_scalar

        # Tính tốc độ để log
        speed = (data.distance_m / predicted_duration) * 3.6  # km/h
        logger.info(f"Dự đoán: {predicted_duration:.2f} giây, tốc độ: {speed:.2f} km/h")

        return {"predicted_duration_seconds": predicted_duration}

    except Exception as e:
        logger.error(f"Lỗi dự đoán: {str(e)}")
        import traceback
        logger.error(f"Chi tiết lỗi: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))