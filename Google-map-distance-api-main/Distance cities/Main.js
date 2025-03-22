﻿// Khởi tạo bản đồ Here Maps
var platform = new H.service.Platform({
    'apikey': 'Gb_4_oj95K7LCSNQG-cp5Ub4TNfzvgpHDqnz6uz8q34' // Thay thế bằng API Key của bạn
});

var defaultLayers = platform.createDefaultLayers();
var map = new H.Map(
    document.getElementById('map'),
    defaultLayers.vector.normal.map,
    {
        center: { lat: 21.0278, lng: 105.8342 },
        zoom: 6
    }
);
var ui = H.ui.UI.createDefault(map, defaultLayers);
var behavior = new H.mapevents.Behavior(new H.mapevents.MapEvents(map));

var startMarker, endMarker, routes = [];
var startCoords, endCoords;
var isSettingStartPoint = false;
var isSettingEndPoint = false;

function setStartPoint() {
    isSettingStartPoint = true;
    isSettingEndPoint = false;
    alert("Nhấp vào bản đồ để chọn điểm đi.");
}

function setEndPoint() {
    isSettingEndPoint = true;
    isSettingStartPoint = false;
    alert("Nhấp vào bản đồ để chọn điểm đến.");
}

// Hàm để chuyển đổi tọa độ thành địa chỉ
function reverseGeocode(lat, lng, callback) {
    fetch(`https://revgeocode.search.hereapi.com/v1/revgeocode?at=${lat},${lng}&apikey=Gb_4_oj95K7LCSNQG-cp5Ub4TNfzvgpHDqnz6uz8q34`)
        .then(response => response.json())
        .then(data => {
            if (data.items.length > 0) {
                callback(data.items[0].address.label);
            } else {
                callback("Không thể xác định địa chỉ");
            }
        })
        .catch(error => console.error("Lỗi reverse geocoding:", error));
}
// Hàm để tìm tọa độ từ địa chỉ
function geocodeAddress(address, callback) {
    if (!address || address.trim() === "") {
        alert("Vui lòng nhập địa chỉ hợp lệ!");
        callback(null);
        return;
    }

    let url = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(address)}&apikey=Gb_4_oj95K7LCSNQG-cp5Ub4TNfzvgpHDqnz6uz8q34`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.items.length > 0) {
                let lat = data.items[0].position.lat;
                let lng = data.items[0].position.lng;
                callback([lat, lng]);
            } else {
                alert("Không tìm thấy tọa độ của địa điểm này!");
                callback(null);
            }
        })
        .catch(error => {
            console.error("Lỗi khi lấy tọa độ:", error);
            alert("Có lỗi xảy ra khi tìm tọa độ!");
            callback(null);
        });
}

// Xử lý sự kiện click trên bản đồ
map.addEventListener('tap', function(evt) {
    var coord = map.screenToGeo(evt.currentPointer.viewportX, evt.currentPointer.viewportY);
    
    if (isSettingStartPoint) {
        startCoords = [coord.lat, coord.lng];
        if (startMarker) map.removeObject(startMarker);
        startMarker = new H.map.Marker(coord);
        map.addObject(startMarker);

        reverseGeocode(coord.lat, coord.lng, function(address) {
            document.getElementById('startPoint').value = address;
        });
        isSettingStartPoint = false;
    } else if (isSettingEndPoint) {
        endCoords = [coord.lat, coord.lng];
        if (endMarker) map.removeObject(endMarker);
        endMarker = new H.map.Marker(coord);
        map.addObject(endMarker);

        reverseGeocode(coord.lat, coord.lng, function(address) {
            document.getElementById('endPoint').value = address;
        });
        isSettingEndPoint = false;
    }
});

// Hàm để tìm tọa độ từ điểm đi đã nhập
function findStartCoords() {
    var address = document.getElementById('startPoint').value;
    if (!address || address.trim() === "") {
        alert("Vui lòng nhập địa chỉ điểm đi!");
        return;
    }
    
    geocodeAddress(address, function(coords) {
        if (coords) {
            startCoords = coords;
            var point = { lat: coords[0], lng: coords[1] };
            
            if (startMarker) map.removeObject(startMarker);
            startMarker = new H.map.Marker(point);
            map.addObject(startMarker);
            map.setCenter(point);
        }
    });
}

// Hàm để tìm tọa độ từ điểm đến đã nhập
function findEndCoords() {
    var address = document.getElementById('endPoint').value;
    if (!address || address.trim() === "") {
        alert("Vui lòng nhập địa chỉ điểm đến!");
        return;
    }
    
    geocodeAddress(address, function(coords) {
        if (coords) {
            endCoords = coords;
            var point = { lat: coords[0], lng: coords[1] };
            
            if (endMarker) map.removeObject(endMarker);
            endMarker = new H.map.Marker(point);
            map.addObject(endMarker);
            map.setCenter(point);
        }
    });
}

// Hàm xử lý khi người dùng nhấn nút "Tìm đường"
function findRoute() {
    // Nếu người dùng đã nhập địa chỉ mà chưa chọn trên bản đồ, thực hiện geocoding
    var startAddressInput = document.getElementById('startPoint').value;
    var endAddressInput = document.getElementById('endPoint').value;
    
    // Kiểm tra nếu không có địa chỉ
    if (!startAddressInput || !endAddressInput) {
        alert("Vui lòng nhập cả điểm đi và điểm đến!");
        return;
    }
    
    // Nếu đã có tọa độ, tính đường đi ngay
    if (startCoords && endCoords) {
        calculateDistance();
        return;
    }
    
    var startPromise = new Promise((resolve) => {
        if (!startCoords) {
            geocodeAddress(startAddressInput, function(coords) {
                if (coords) {
                    startCoords = coords;
                    var point = { lat: coords[0], lng: coords[1] };
                    
                    if (startMarker) map.removeObject(startMarker);
                    startMarker = new H.map.Marker(point);
                    map.addObject(startMarker);
                }
                resolve();
            });
        } else {
            resolve();
        }
    });
    
    var endPromise = new Promise((resolve) => {
        if (!endCoords) {
            geocodeAddress(endAddressInput, function(coords) {
                if (coords) {
                    endCoords = coords;
                    var point = { lat: coords[0], lng: coords[1] };
                    
                    if (endMarker) map.removeObject(endMarker);
                    endMarker = new H.map.Marker(point);
                    map.addObject(endMarker);
                }
                resolve();
            });
        } else {
            resolve();
        }
    });
    
    // Sau khi đã xử lý cả hai điểm, tính đường đi
    Promise.all([startPromise, endPromise]).then(() => {
        if (startCoords && endCoords) {
            calculateDistance();
        } else {
            alert("Không thể xác định tọa độ của một hoặc cả hai điểm. Vui lòng thử lại!");
        }
    });
}

// Hàm để tính toán đường đi
function calculateDistance() {
    if (!startCoords || !endCoords) {
        findRoute(); // Nếu chưa có tọa độ, chuyển sang tìm tọa độ trước
        return;
    }

    // Cấu hình tham số định tuyến
    var routingParameters = {
        transportMode: 'car',
        origin: `${startCoords[0]},${startCoords[1]}`,
        destination: `${endCoords[0]},${endCoords[1]}`,
        return: 'polyline,summary',
        alternatives: 3 // Yêu cầu tối đa 3 tuyến đường
    };

    var router = platform.getRoutingService(null, 8); // API V8
    router.calculateRoute(routingParameters, function(result) {
        if (result.routes.length > 0) {
            // Xóa tuyến đường cũ nếu có
            routes.forEach(route => map.removeObject(route));
            routes = [];

            // Xóa nội dung hiển thị khoảng cách & thời gian
            document.getElementById("routeInfo").innerHTML = "";

            let colors = ["blue", "green", "red"]; // Màu sắc cho từng tuyến đường
            result.routes.forEach((routeData, index) => {
                if (routeData.sections.length > 0) {
                    let routeShape = routeData.sections[0].polyline;
                    let linestring = H.geo.LineString.fromFlexiblePolyline(routeShape);

                    // Vẽ tuyến đường với màu tương ứng
                    let polyline = new H.map.Polyline(linestring, {
                        style: { strokeColor: colors[index % colors.length], lineWidth: 5 }
                    });

                    map.addObject(polyline);
                    routes.push(polyline);
                    map.getViewModel().setLookAtData({ bounds: polyline.getBoundingBox() });

                    // Lấy khoảng cách & thời gian ước tính
                    let distance = (routeData.sections[0].summary.length / 1000).toFixed(2);
                    let travelTimeSec = routeData.sections[0].summary.duration;
                    let travelTimeMin = Math.floor(travelTimeSec / 60);
                    let travelTimeSecRemaining = Math.floor(travelTimeSec % 60);

                    // Thêm thông tin vào HTML
                    let routeInfo = `
                        <p style="color: ${colors[index % colors.length]};">
                            🔹 <strong>Tuyến đường ${index + 1}:</strong> 
                            ${distance} km - ${travelTimeMin} phút ${travelTimeSecRemaining} giây
                        </p>
                    `;
                    document.getElementById("routeInfo").innerHTML += routeInfo;
                }
            });
        } else {
            alert("Không thể tìm đường đi!");
        }
    }, function(error) {
        console.error("Lỗi tính đường đi:", error);
        alert("Đã xảy ra lỗi khi tính đường đi!");
    });
}

// Thêm event listeners khi trang đã tải xong
document.addEventListener('DOMContentLoaded', function() {
    // Nút tìm đường sẽ gọi hàm findRoute
    document.getElementById('findRouteBtn').addEventListener('click', findRoute);
    
    // Xử lý khi người dùng nhấn Enter trong các ô input
    document.getElementById('startPoint').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            // Nếu cả hai ô đã có dữ liệu, tìm đường luôn
            if (document.getElementById('endPoint').value.trim() !== "") {
                findRoute();
            } else {
                findStartCoords();
            }
        }
    });
    
    document.getElementById('endPoint').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            // Nếu cả hai ô đã có dữ liệu, tìm đường luôn
            if (document.getElementById('startPoint').value.trim() !== "") {
                findRoute();
            } else {
                findEndCoords();
            }
        }
    });
});