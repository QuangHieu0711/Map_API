CREATE DATABASE DataMap;
GO

USE DataMap;
GO

CREATE TABLE Routes (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Date DATE NOT NULL,
    Time TIME NOT NULL,
    StartPoint NVARCHAR(255) NOT NULL,
    EndPoint NVARCHAR(255) NOT NULL,
    Distance FLOAT NOT NULL,
    TravelTime INT NOT NULL
);


select * from Routes
