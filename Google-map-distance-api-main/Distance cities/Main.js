<<<<<<< Updated upstream
﻿// Khởi tạo bản đồ với trung tâm mặc định (Hà Nội)
var map = L.map('map').setView([21.0278, 105.8342], 6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
}).addTo(map);

// Thêm control geocoder để tìm kiếm địa chỉ
var geocoder = L.Control.geocoder({
    defaultMarkGeocode: false
}).addTo(map);

var startMarker, endMarker, routes = [];
var startCoords, endCoords;
var isSettingStartPoint = false;
var isSettingEndPoint = false;

// Hàm để thiết lập điểm đi
function setStartPoint() {
    isSettingStartPoint = true;
    isSettingEndPoint = false;
    alert("Nhấp vào bản đồ để chọn điểm đi.");
}

// Hàm để thiết lập điểm đến
function setEndPoint() {
    isSettingEndPoint = true;
    isSettingStartPoint = false;
    alert("Nhấp vào bản đồ để chọn điểm đến.");
=======
﻿﻿// Khởi tạo bản đồ Here Maps
const platform = new H.service.Platform({
    apikey: 'obtUNXXVNEw-lseLFfxlrirLW8Z8Zn578K8fTYSJnXQ'
});

const defaultLayers = platform.createDefaultLayers();
const map = new H.Map(document.getElementById('map'), defaultLayers.vector.normal.map, {
    center: { lat: 21.0278, lng: 105.8342 },
    zoom: 13
});
const ui = H.ui.UI.createDefault(map, defaultLayers);
const behavior = new H.mapevents.Behavior(new H.mapevents.MapEvents(map));

let startMarker, endMarker, routes = [];
let startCoords, endCoords;
let isSettingStartPoint = false;
let isSettingEndPoint = false;
let autoUpdateInterval;
let lastSentData = null; // Lưu dữ liệu đã gửi cuối cùng

// Danh sách các quận tại Hà Nội với phạm vi tọa độ
const districts = [
    { name: "Ba Đình", latRange: [21.0300, 21.0500], lngRange: [105.8200, 105.8400] },
    { name: "Hoàn Kiếm", latRange: [21.0200, 21.0400], lngRange: [105.8400, 105.8600] },
    { name: "Hai Bà Trưng", latRange: [21.0000, 21.0200], lngRange: [105.8400, 105.8700] },
    { name: "Đống Đa", latRange: [21.0000, 21.0300], lngRange: [105.8200, 105.8400] },
    { name: "Tây Hồ", latRange: [21.0500, 21.0800], lngRange: [105.8100, 105.8400] },
    { name: "Cầu Giấy", latRange: [21.0200, 21.0500], lngRange: [105.7800, 105.8100] },
    { name: "Thanh Xuân", latRange: [20.9800, 21.0100], lngRange: [105.7900, 105.8200] },
    { name: "Hoàng Mai", latRange: [20.9500, 20.9900], lngRange: [105.8400, 105.8800] },
    { name: "Long Biên", latRange: [21.0200, 21.0600], lngRange: [105.8700, 105.9100] },
    { name: "Hà Đông", latRange: [20.9500, 20.9800], lngRange: [105.7400, 105.7800] },
    { name: "Bắc Từ Liêm", latRange: [21.0500, 21.0800], lngRange: [105.7400, 105.7800] },
    { name: "Nam Từ Liêm", latRange: [21.0100, 21.0400], lngRange: [105.7400, 105.7700] }
];

// Hàm tạo ngẫu nhiên tọa độ trong một quận
function getRandomCoordsInDistrict() {
    const districtIndex = Math.floor(Math.random() * districts.length);
    const district = districts[districtIndex];

    const lat = Math.random() * (district.latRange[1] - district.latRange[0]) + district.latRange[0];
    const lng = Math.random() * (district.lngRange[1] - district.lngRange[0]) + district.lngRange[0];

    return { coords: [lat, lng], district: district.name };
}

// Hàm cập nhật thời gian hiện tại vào input datetime-local
function updateCurrentTime() {
    const now = new Date();
    
    // Chuyển sang múi giờ Việt Nam (UTC+7)
    const vietnamTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" });

    // Chuyển về đối tượng Date để dễ xử lý
    const localVietnamTime = new Date(vietnamTime);

    // Định dạng thời gian thành chuỗi YYYY-MM-DDThh:mm để đặt vào input
    const year = localVietnamTime.getFullYear();
    const month = String(localVietnamTime.getMonth() + 1).padStart(2, '0');
    const day = String(localVietnamTime.getDate()).padStart(2, '0');
    const hours = String(localVietnamTime.getHours()).padStart(2, '0');
    const minutes = String(localVietnamTime.getMinutes()).padStart(2, '0');

    const formattedDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
    document.getElementById('departureTime').value = formattedDateTime;

    // Hiển thị thời gian thực trên giao diện
    const displayTime = document.getElementById('currentTimeDisplay');
    if (displayTime) {
        displayTime.textContent = `Thời gian hiện tại: ${hours}:${minutes} ${day}/${month}/${year}`;
    }
}

// Cập nhật thời gian mỗi giây (chỉ để hiển thị)
setInterval(updateCurrentTime, 1000);
updateCurrentTime();

// Hàm bắt đầu tự động cập nhật thời gian
function startAutoUpdate() {
    updateCurrentTime();
    autoUpdateInterval = setInterval(updateCurrentTime, 1000);
>>>>>>> Stashed changes
}

// Hàm để chuyển đổi tọa độ thành địa chỉ (reverse geocoding)
function reverseGeocode(lat, lng, callback) {
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
        .then(response => response.json())
        .then(data => {
            if (data.display_name) {
                callback(data.display_name);
            } else {
                callback("Không thể xác định địa chỉ");
            }
        })
        .catch(error => {
            console.error("Lỗi reverse geocoding:", error);
            callback("Lỗi khi lấy địa chỉ");
        });
}

// Hàm để chuyển đổi địa chỉ thành tọa độ (geocoding)
function geocodeAddress(address, callback) {
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`)
        .then(response => response.json())
        .then(data => {
            if (data.length > 0) {
                callback([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
            } else {
                callback(null);
            }
        })
        .catch(error => {
            console.error("Lỗi geocoding:", error);
            callback(null);
        });
}

// Xử lý sự kiện click trên bản đồ
map.on('click', function(e) {
    if (isSettingStartPoint) {
        startCoords = [e.latlng.lat, e.latlng.lng];
        if (startMarker) map.removeLayer(startMarker);
        startMarker = L.marker(startCoords).addTo(map)
            .bindPopup(`Điểm đi: ${startCoords}`).openPopup();

        // Lấy địa chỉ từ tọa độ và cập nhật ô input
        reverseGeocode(startCoords[0], startCoords[1], function(address) {
            document.getElementById('startPoint').value = address;
        });

        isSettingStartPoint = false;
    } else if (isSettingEndPoint) {
        endCoords = [e.latlng.lat, e.latlng.lng];
        if (endMarker) map.removeLayer(endMarker);
        endMarker = L.marker(endCoords).addTo(map)
            .bindPopup(`Điểm đến: ${endCoords}`).openPopup();

        // Lấy địa chỉ từ tọa độ và cập nhật ô input
        reverseGeocode(endCoords[0], endCoords[1], function(address) {
            document.getElementById('endPoint').value = address;
        });

        isSettingEndPoint = false;
    }
});

<<<<<<< Updated upstream
// Hàm để tính khoảng cách
=======
// Hàm tìm tọa độ từ địa chỉ đã nhập
function findCoords(type) {
    const address = document.getElementById(`${type}Point`).value;
    if (!address?.trim()) {
        alert(`Vui lòng nhập địa chỉ điểm ${type === 'start' ? 'đi' : 'đến'}!`);
        return;
    }

    geocodeAddress(address, coords => {
        if (coords) {
            const point = { lat: coords[0], lng: coords[1] };
            const marker = type === 'start' ? startMarker : endMarker;

            if (marker) map.removeObject(marker);
            const newMarker = new H.map.Marker(point);
            map.addObject(newMarker);

            if (type === 'start') {
                startCoords = coords;
                startMarker = newMarker;
            } else {
                endCoords = coords;
                endMarker = newMarker;
            }

            map.setCenter(point);
        }
    });
}

// Hàm chọn ngẫu nhiên điểm đi và điểm đến trong các quận của Hà Nội
async function getRandomPoints() {
    // Chọn ngẫu nhiên điểm đi
    const startPoint = getRandomCoordsInDistrict();
    let endPoint;

    // Chọn ngẫu nhiên điểm đến, đảm bảo không trùng quận với điểm đi
    do {
        endPoint = getRandomCoordsInDistrict();
    } while (endPoint.district === startPoint.district);

    // Lấy địa chỉ từ tọa độ bằng Reverse Geocoding
    const startAddress = await new Promise(resolve => {
        reverseGeocode(startPoint.coords[0], startPoint.coords[1], address => {
            resolve(address);
        });
    });

    const endAddress = await new Promise(resolve => {
        reverseGeocode(endPoint.coords[0], endPoint.coords[1], address => {
            resolve(address);
        });
    });

    return {
        start: {
            address: startAddress,
            coords: startPoint.coords
        },
        end: {
            address: endAddress,
            coords: endPoint.coords
        }
    };
}

// Hàm tính toán đường đi
>>>>>>> Stashed changes
function calculateDistance() {
    var startAddress = document.getElementById('startPoint').value;
    var endAddress = document.getElementById('endPoint').value;

    if (!startAddress || !endAddress) {
        alert("Vui lòng nhập cả điểm đi và điểm đến!");
        return;
    }

<<<<<<< Updated upstream
    // Geocode địa chỉ điểm đi
    geocodeAddress(startAddress, function(coords) {
        if (!coords) {
            alert("Không thể tìm thấy tọa độ cho điểm đi!");
            return;
=======
    // Lấy thời gian hiện tại tại Việt Nam (UTC+7)
    const vietnamTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" });
    const currentTime = new Date(vietnamTime);
    const hours = String(currentTime.getHours()).padStart(2, '0');
    const minutes = String(currentTime.getMinutes()).padStart(2, '0');
    const seconds = String(currentTime.getSeconds()).padStart(2, '0');
    const formattedTime = `${hours}:${minutes}:${seconds}`;

    const departureTime = document.getElementById('departureTime').value;
    const routingParameters = {
        transportMode: 'car',
        origin: `${startCoords[0]},${startCoords[1]}`,
        destination: `${endCoords[0]},${endCoords[1]}`,
        return: 'polyline,summary',
        alternatives: 3,
        departureTime: departureTime ? new Date(departureTime).toISOString() : new Date().toISOString()
    };

    const router = platform.getRoutingService(null, 8);
    router.calculateRoute(routingParameters, result => {
        if (result.routes.length > 0) {
            routes.forEach(route => map.removeObject(route));
            routes = [];
            document.getElementById("routeDetailsContent").innerHTML = "";

            const colors = ["blue", "green", "red"];
            let routesToSend = [];

            result.routes.forEach((routeData, index) => {
                if (routeData.sections.length > 0) {
                    const routeShape = routeData.sections[0].polyline;
                    const linestring = H.geo.LineString.fromFlexiblePolyline(routeShape);
                    const polyline = new H.map.Polyline(linestring, {
                        style: { strokeColor: colors[index % colors.length], lineWidth: 5 }
                    });

                    map.addObject(polyline);
                    routes.push(polyline);
                    map.getViewModel().setLookAtData({ bounds: polyline.getBoundingBox() });

                    const distance = (routeData.sections[0].summary.length / 1000).toFixed(2);
                    const travelTimeSec = routeData.sections[0].summary.duration;
                    const travelTimeMin = Math.floor(travelTimeSec / 60);
                    const travelTimeSecRemaining = Math.floor(travelTimeSec % 60);

                    const startPoint = document.getElementById('startPoint').value;
                    const endPoint = document.getElementById('endPoint').value;

                    routesToSend.push({
                        date: currentTime.toISOString().split('T')[0],
                        time: formattedTime,
                        startPoint: startPoint,
                        endPoint: endPoint,
                        distance: distance,
                        travelTime: travelTimeMin * 60 + travelTimeSecRemaining
                    });

                    const routeInfo = `
                        <p style="color: ${colors[index % colors.length]};">
                            🔹 <strong>Tuyến đường ${index + 1}:</strong> 
                            ${distance} km - ${travelTimeMin} phút ${travelTimeSecRemaining} giây
                        </p>
                    `;
                    document.getElementById("routeDetailsContent").innerHTML += routeInfo;
                }
            });

            // Kiểm tra xem dữ liệu có khác với lần gửi trước không (bỏ qua time)
            if (routesToSend.length > 0) {
                const routesToCompare = routesToSend.map(route => ({
                    date: route.date,
                    startPoint: route.startPoint,
                    endPoint: route.endPoint,
                    distance: route.distance,
                    travelTime: route.travelTime
                }));
                const currentDataString = JSON.stringify(routesToCompare);
                if (lastSentData !== currentDataString) {
                    fetch('http://localhost:3000/save-route', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(routesToSend)
                    })
                    .then(response => response.json())
                    .then(data => {
                        console.log('Dữ liệu đã được lưu:', data);
                        lastSentData = currentDataString;
                    })
                    .catch(error => console.error('Lỗi khi gửi dữ liệu:', error));
                } else {
                    console.log('Dữ liệu trùng lặp, không gửi lại.');
                }
            }
        } else {
            alert("Không thể tìm đường đi!");
>>>>>>> Stashed changes
        }
        startCoords = coords;
        if (startMarker) map.removeLayer(startMarker);
        startMarker = L.marker(startCoords).addTo(map)
            .bindPopup(`Điểm đi: ${startCoords}`).openPopup();

<<<<<<< Updated upstream
        // Geocode địa chỉ điểm đến
        geocodeAddress(endAddress, function(coords) {
            if (!coords) {
                alert("Không thể tìm thấy tọa độ cho điểm đến!");
                return;
=======
// Hàm tạo tuyến đường ngẫu nhiên và lưu vào cơ sở dữ liệu
async function generateRandomRoute() {
    try {
        const points = await getRandomPoints();
        startCoords = points.start.coords;
        endCoords = points.end.coords;

        // Cập nhật giá trị điểm đi và điểm đến trên giao diện
        document.getElementById('startPoint').value = points.start.address;
        document.getElementById('endPoint').value = points.end.address;

        // Lấy thời gian hiện tại tại Việt Nam (UTC+7)
        const vietnamTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" });
        const currentTime = new Date(vietnamTime);
        const hours = String(currentTime.getHours()).padStart(2, '0');
        const minutes = String(currentTime.getMinutes()).padStart(2, '0');
        const seconds = String(currentTime.getSeconds()).padStart(2, '0');
        const formattedTime = `${hours}:${minutes}:${seconds}`;

        const departureTime = document.getElementById('departureTime').value;
        const routingParameters = {
            transportMode: 'car',
            origin: `${startCoords[0]},${startCoords[1]}`,
            destination: `${endCoords[0]},${endCoords[1]}`,
            return: 'polyline,summary',
            alternatives: 3,
            departureTime: departureTime ? new Date(departureTime).toISOString() : new Date().toISOString()
        };

        const router = platform.getRoutingService(null, 8);
        router.calculateRoute(routingParameters, result => {
            if (result.routes.length > 0) {
                routes.forEach(route => map.removeObject(route));
                routes = [];
                document.getElementById("routeDetailsContent").innerHTML = "";

                const colors = ["blue", "green", "red"];
                let routesToSend = [];

                result.routes.forEach((routeData, index) => {
                    if (routeData.sections.length > 0) {
                        const routeShape = routeData.sections[0].polyline;
                        const linestring = H.geo.LineString.fromFlexiblePolyline(routeShape);
                        const polyline = new H.map.Polyline(linestring, {
                            style: { strokeColor: colors[index % colors.length], lineWidth: 5 }
                        });

                        map.addObject(polyline);
                        routes.push(polyline);
                        map.getViewModel().setLookAtData({ bounds: polyline.getBoundingBox() });

                        const distance = (routeData.sections[0].summary.length / 1000).toFixed(2);
                        const travelTimeSec = routeData.sections[0].summary.duration;
                        const travelTimeMin = Math.floor(travelTimeSec / 60);
                        const travelTimeSecRemaining = Math.floor(travelTimeSec % 60);

                        const startPoint = points.start.address;
                        const endPoint = points.end.address;

                        routesToSend.push({
                            date: currentTime.toISOString().split('T')[0],
                            time: formattedTime,
                            startPoint: startPoint,
                            endPoint: endPoint,
                            distance: distance,
                            travelTime: travelTimeMin * 60 + travelTimeSecRemaining
                        });

                        const routeInfo = `
                            <p style="color: ${colors[index % colors.length]};">
                                🔹 <strong>Tuyến đường ${index + 1}:</strong> 
                                ${distance} km - ${travelTimeMin} phút ${travelTimeSecRemaining} giây
                            </p>
                        `;
                        document.getElementById("routeDetailsContent").innerHTML += routeInfo;
                    }
                });

                // Kiểm tra xem dữ liệu có khác với lần gửi trước không (bỏ qua time)
                if (routesToSend.length > 0) {
                    const routesToCompare = routesToSend.map(route => ({
                        date: route.date,
                        startPoint: route.startPoint,
                        endPoint: route.endPoint,
                        distance: route.distance,
                        travelTime: route.travelTime
                    }));
                    const currentDataString = JSON.stringify(routesToCompare);
                    if (lastSentData !== currentDataString) {
                        fetch('http://localhost:3000/save-route', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(routesToSend)
                        })
                        .then(response => response.json())
                        .then(data => {
                            console.log('Dữ liệu đã được lưu:', data);
                            lastSentData = currentDataString;
                        })
                        .catch(error => console.error('Lỗi khi gửi dữ liệu:', error));
                    } else {
                        console.log('Dữ liệu trùng lặp, không gửi lại.');
                    }
                }
            } else {
                alert("Không thể tìm đường đi!");
            }
        }, error => {
            console.error("Lỗi tính đường đi:", error);
            alert("Đã xảy ra lỗi khi tính đường đi!");
        });
    } catch (error) {
        console.error("Lỗi khi tạo tuyến đường ngẫu nhiên:", error);
        alert("Đã xảy ra lỗi khi tạo tuyến đường ngẫu nhiên!");
    }
}

// Khởi tạo sự kiện khi trang tải xong
document.addEventListener('DOMContentLoaded', () => {
    startAutoUpdate();

    document.getElementById('findRouteBtn').addEventListener('click', calculateDistance);
    document.getElementById('setStartPointBtn').addEventListener('click', () => setPoint('start'));
    document.getElementById('setEndPointBtn').addEventListener('click', () => setPoint('end'));
    document.getElementById('startPoint').addEventListener('keypress', e => {
        if (e.key === 'Enter') findCoords('start');
    });
    document.getElementById('endPoint').addEventListener('keypress', e => {
        if (e.key === 'Enter') findCoords('end');
    });
    document.getElementById('randomRouteBtn').addEventListener('click', generateRandomRoute);
});

// Lấy vị trí hiện tại
function getCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                let lat = position.coords.latitude;
                let lng = position.coords.longitude;
                let currentCoords = { lat: lat, lng: lng };

                // Hiển thị vị trí trên bản đồ
                let currentMarker = new H.map.Marker(currentCoords);
                map.addObject(currentMarker);
                map.setCenter(currentCoords);
                map.setZoom(14);

                // Hiển thị địa chỉ
                reverseGeocode(lat, lng, function(address) {
                    document.getElementById('startPoint').value = address;
                });

                // Lưu vị trí làm điểm bắt đầu
                startCoords = [lat, lng];
            },
            function(error) {
                alert("Không thể lấy vị trí! Hãy kiểm tra cài đặt trình duyệt.");
                console.error("Lỗi Geolocation:", error);
>>>>>>> Stashed changes
            }
            endCoords = coords;
            if (endMarker) map.removeLayer(endMarker);
            endMarker = L.marker(endCoords).addTo(map)
                .bindPopup(`Điểm đến: ${endCoords}`).openPopup();

            // Tính khoảng cách và vẽ đường đi
            fetch(`https://router.project-osrm.org/route/v1/driving/${startCoords[1]},${startCoords[0]};${endCoords[1]},${endCoords[0]}?overview=full&geometries=geojson&alternatives=true`)
                .then(response => response.json())
                .then(data => {
                    if (data.routes && data.routes.length > 0) {
                        // Xóa các đường cũ (nếu có)
                        routes.forEach(route => map.removeLayer(route));
                        routes = [];

                        // Hiển thị tất cả các tuyến đường
                        data.routes.forEach((routeData, index) => {
                            var routeCoords = routeData.geometry.coordinates.map(coord => [coord[1], coord[0]]);
                            var routeColor = index === 0 ? 'blue' : index === 1 ? 'green' : 'red'; // Màu sắc khác nhau cho các tuyến
                            var route = L.polyline(routeCoords, { color: routeColor }).addTo(map);
                            routes.push(route);

                            // Hiển thị khoảng cách của từng tuyến
                            var distance = routeData.distance / 1000; // Chuyển từ mét sang km
                            route.bindPopup(`Tuyến ${index + 1}: ${distance.toFixed(2)} km`).openPopup();
                        });

                        // Điều chỉnh bản đồ để hiển thị tất cả các tuyến
                        map.fitBounds(routes[0].getBounds());
                    } else {
                        alert("Không thể tính đường đi!");
                    }
                })
                .catch(error => console.error("Lỗi OSRM:", error));
        });
    });
}