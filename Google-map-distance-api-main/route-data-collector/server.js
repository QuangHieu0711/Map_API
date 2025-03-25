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

// API để nhận dữ liệu từ client và lưu vào SQL Server
app.post('/save-route', async (req, res) => {
    try {
        const routes = req.body;

        let pool = await sql.connect(dbConfig);
        let query = `
            INSERT INTO Routes (Date, Time, StartPoint, EndPoint, Distance, TravelTime)
            VALUES (@date, @time, @startPoint, @endPoint, @distance, @travelTime)
        `;

        for (const route of routes) {
            const { date, time, startPoint, endPoint, distance, travelTime } = route;
            const [hours, minutes, seconds] = time.split(':');
            const timeDate = new Date();
            timeDate.setHours(parseInt(hours, 10) + 7);
            timeDate.setMinutes(parseInt(minutes, 10));
            timeDate.setSeconds(parseInt(seconds, 10));
            timeDate.setMilliseconds(0);

            await pool.request()
                .input('date', sql.Date, date)
                .input('time', sql.Time, timeDate)
                .input('startPoint', sql.NVarChar, startPoint)
                .input('endPoint', sql.NVarChar, endPoint)
                .input('distance', sql.Float, distance)
                .input('travelTime', sql.Int, travelTime)
                .query(query);
        }

        res.status(200).json({ message: 'Dữ liệu đã được lưu thành công!' });
    } catch (error) {
        console.error('Lỗi khi lưu dữ liệu:', error);
        res.status(500).json({ message: 'Lỗi khi lưu dữ liệu!', error: error.message });
    }
});

// Khởi động server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`hehe ${PORT}`);
});