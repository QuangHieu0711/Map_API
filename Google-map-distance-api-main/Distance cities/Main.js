// Khởi tạo bản đồ với trung tâm mặc định (Hà Nội)
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

// Hàm để tính khoảng cách
function calculateDistance() {
    var startAddress = document.getElementById('startPoint').value;
    var endAddress = document.getElementById('endPoint').value;

    if (!startAddress || !endAddress) {
        alert("Vui lòng nhập cả điểm đi và điểm đến!");
        return;
    }

    // Geocode địa chỉ điểm đi
    geocodeAddress(startAddress, function(coords) {
        if (!coords) {
            alert("Không thể tìm thấy tọa độ cho điểm đi!");
            return;
        }
        startCoords = coords;
        if (startMarker) map.removeLayer(startMarker);
        startMarker = L.marker(startCoords).addTo(map)
            .bindPopup(`Điểm đi: ${startCoords}`).openPopup();

        // Geocode địa chỉ điểm đến
        geocodeAddress(endAddress, function(coords) {
            if (!coords) {
                alert("Không thể tìm thấy tọa độ cho điểm đến!");
                return;
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