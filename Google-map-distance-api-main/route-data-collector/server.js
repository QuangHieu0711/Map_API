const express = require('express');
const sql = require('mssql');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: false,
        trustServerCertificate: true
    },
    port: 1433
};

// API để nhận dữ liệu tuyến đường và các điểm đánh dấu từ client và lưu vào SQL Server
app.post('/save-route', async (req, res) => {
    try {
        const routes = req.body;
        let pool = await sql.connect(dbConfig);

        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            for (const route of routes) {
                const { date, time, startPoint, endPoint, distance, travelTime, points } = route;

                // Chuyển chuỗi time (HH:mm:ss) thành đối tượng Date
                const [hours, minutes, seconds] = time.split(':').map(Number);
                const timeDate = new Date();
                timeDate.setHours(hours, minutes, seconds, 0);

                const routeResult = await new sql.Request(transaction)
                    .input('date', sql.Date, date)
                    .input('time', sql.Time, timeDate) // Truyền đối tượng Date thay vì chuỗi
                    .input('startPoint', sql.NVarChar, startPoint)
                    .input('endPoint', sql.NVarChar, endPoint)
                    .input('distance', sql.Float, distance)
                    .input('travelTime', sql.Int, travelTime)
                    .query(
                        `INSERT INTO Routes (Date, Time, StartPoint, EndPoint, Distance, TravelTime)
                        OUTPUT INSERTED.RouteID
                        VALUES (@date, @time, @startPoint, @endPoint, @distance, @travelTime)`
                    );

                const routeId = routeResult.recordset[0].RouteID;
                const direction = `Từ ${startPoint} đến ${endPoint}`;

                if (points && Array.isArray(points) && points.length > 0) {
                    for (let i = 0; i < points.length; i++) {
                        const point = points[i];

                        const distanceInMeters = typeof point.distance === 'number' && !isNaN(point.distance) ? point.distance : 0;
                        const duration = typeof point.duration === 'number' && !isNaN(point.duration) ? Math.round(point.duration) : 0;
                        const trafficDuration = typeof point.trafficDuration === 'number' && !isNaN(point.trafficDuration) ? Math.round(point.trafficDuration) : duration;
                        const speed = typeof point.speed === 'number' && !isNaN(point.speed) ? point.speed : 0;

                        console.log(`RoutePoint ${i + 1}: Distance = ${distanceInMeters} m, Duration = ${duration} s, Speed = ${speed} km/h`);

                        await new sql.Request(transaction)
                            .input('time', sql.Time, timeDate) // Sử dụng cùng timeDate
                            .input('routeId', sql.Int, routeId)
                            .input('startLat', sql.Float, point.startLat)
                            .input('startLng', sql.Float, point.startLng)
                            .input('startAddress', sql.NVarChar, point.startAddress)
                            .input('endLat', sql.Float, point.endLat)
                            .input('endLng', sql.Float, point.endLng)
                            .input('endAddress', sql.NVarChar, point.endAddress)
                            .input('distance', sql.Float, distanceInMeters)
                            .input('duration', sql.Int, duration)
                            .input('trafficDuration', sql.Int, trafficDuration)
                            .input('speed', sql.Float, speed)
                            .input('direction', sql.NVarChar, direction)
                            .query(
                                `INSERT INTO RoutePoints (Time, RouteID, StartLat, StartLng, StartAddress, 
                                                       EndLat, EndLng, EndAddress, Distance, Duration, 
                                                       TrafficDuration, Speed, Direction)
                                VALUES (@time, @routeId, @startLat, @startLng, @startAddress, 
                                        @endLat, @endLng, @endAddress, @distance, @duration, 
                                        @trafficDuration, @speed, @direction)`
                            );
                    }
                }
            }

            await transaction.commit();
            res.status(200).json({ message: 'Dữ liệu đã được lưu thành công!' });
        } catch (error) {
            await transaction.rollback();
            throw error;
        }
    } catch (error) {
        console.error('Lỗi khi lưu dữ liệu:', error);
        console.error('Dữ liệu gửi lên:', JSON.stringify(req.body, null, 2));
        res.status(500).json({ message: 'Lỗi khi lưu dữ liệu!', error: error.message });
    }
});

// API để lấy thông tin tuyến đường và các điểm đánh dấu
app.get('/routes/:routeId', async (req, res) => {
    try {
        const routeId = req.params.routeId;
        let pool = await sql.connect(dbConfig);

        const routeResult = await pool.request()
            .input('routeId', sql.Int, routeId)
            .query('SELECT * FROM Routes WHERE RouteID = @routeId');

        if (routeResult.recordset.length === 0) {
            return res.status(404).json({ message: 'Không tìm thấy tuyến đường' });
        }

        const pointsResult = await pool.request()
            .input('routeId', sql.Int, routeId)
            .query('SELECT * FROM RoutePoints WHERE RouteID = @routeId');

        const route = routeResult.recordset[0];
        route.points = pointsResult.recordset;

        res.status(200).json(route);
    } catch (error) {
        console.error('Lỗi khi lấy dữ liệu:', error);
        res.status(500).json({ message: 'Lỗi khi lấy dữ liệu!', error: error.message });
    }
});

// Khởi động server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server đang chạy tại cổng ${PORT}`);
});