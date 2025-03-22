﻿// Khởi tạo bản đồ Here Maps
const platform = new H.service.Platform({
    apikey: 'Gb_4_oj95K7LCSNQG-cp5Ub4TNfzvgpHDqnz6uz8q34' // Thay thế bằng API Key của bạn
});

const defaultLayers = platform.createDefaultLayers();
const map = new H.Map(document.getElementById('map'), defaultLayers.vector.normal.map, {
    center: { lat: 21.0278, lng: 105.8342 }, // Tọa độ trung tâm Hà Nội
    zoom: 13 // Tăng mức zoom từ 6 lên 13 để tập trung vào Hà Nội
});
const ui = H.ui.UI.createDefault(map, defaultLayers);
const behavior = new H.mapevents.Behavior(new H.mapevents.MapEvents(map));

let startMarker, endMarker, routes = [];
let startCoords, endCoords;
let isSettingStartPoint = false;
let isSettingEndPoint = false;
let autoUpdateInterval;

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

    // Nếu đã có điểm xuất phát và điểm đến, cập nhật tuyến đường mỗi phút
    if (typeof startCoords !== "undefined" && typeof endCoords !== "undefined" && now.getSeconds() === 0) {
        calculateDistance();
    }
}

// Cập nhật thời gian mỗi giây
setInterval(updateCurrentTime, 1000);
updateCurrentTime();

// Hàm bắt đầu tự động cập nhật thời gian
function startAutoUpdate() {
    updateCurrentTime();
    autoUpdateInterval = setInterval(updateCurrentTime, 1000);
}

// Hàm đặt điểm đi hoặc điểm đến
function setPoint(type) {
    isSettingStartPoint = type === 'start';
    isSettingEndPoint = type === 'end';
    alert(`Nhấp vào bản đồ để chọn điểm ${type === 'start' ? 'đi' : 'đến'}.`);
}

// Hàm chuyển đổi tọa độ thành địa chỉ
function reverseGeocode(lat, lng, callback) {
    fetch(`https://revgeocode.search.hereapi.com/v1/revgeocode?at=${lat},${lng}&apikey=Gb_4_oj95K7LCSNQG-cp5Ub4TNfzvgpHDqnz6uz8q34`)
        .then(response => response.json())
        .then(data => {
            callback(data.items[0]?.address.label || "Không thể xác định địa chỉ");
        })
        .catch(error => console.error("Lỗi reverse geocoding:", error));
}

// Hàm tìm tọa độ từ địa chỉ
function geocodeAddress(address, callback) {
    if (!address?.trim()) {
        alert("Vui lòng nhập địa chỉ hợp lệ!");
        callback(null);
        return;
    }

    const url = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(address)}&apikey=Gb_4_oj95K7LCSNQG-cp5Ub4TNfzvgpHDqnz6uz8q34`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (data.items.length > 0) {
                const { lat, lng } = data.items[0].position;
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
    const coord = map.screenToGeo(evt.currentPointer.viewportX, evt.currentPointer.viewportY);

    if (isSettingStartPoint || isSettingEndPoint) {
        const isStart = isSettingStartPoint;
        const coords = [coord.lat, coord.lng];
        const marker = isStart ? startMarker : endMarker;

        if (marker) map.removeObject(marker);
        const newMarker = new H.map.Marker(coord);
        map.addObject(newMarker);

        if (isStart) {
            startCoords = coords;
            startMarker = newMarker;
        } else {
            endCoords = coords;
            endMarker = newMarker;
        }

        reverseGeocode(coord.lat, coord.lng, address => {
            document.getElementById(isStart ? 'startPoint' : 'endPoint').value = address;
        });

        isSettingStartPoint = isSettingEndPoint = false;
    }
});

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

// Hàm tính toán đường đi
function calculateDistance() {
    if (!startCoords || !endCoords) {
        alert("Vui lòng chọn cả điểm đi và điểm đến!");
        return;
    }

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
            document.getElementById("routeInfo").innerHTML = "";

            const colors = ["blue", "green", "red"];
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

                    const routeInfo = `
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
    }, error => {
        console.error("Lỗi tính đường đi:", error);
        alert("Đã xảy ra lỗi khi tính đường đi!");
    });
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
});