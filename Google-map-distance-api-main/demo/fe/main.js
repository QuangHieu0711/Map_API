// Khởi tạo Here Maps
const platform = new H.service.Platform({
    apikey: 'Gb_4_oj95K7LCSNQG-cp5Ub4TNfzvgpHDqnz6uz8q34'
});
const defaultLayers = platform.createDefaultLayers();
const map = new H.Map(
    document.getElementById('map'),
    defaultLayers.vector.normal.map,
    {
        zoom: 13,
        center: { lat: 21.0278, lng: 105.8342 }
    }
);
const mapEvents = new H.mapevents.MapEvents(map);
const behavior = new H.mapevents.Behavior(mapEvents);
const ui = H.ui.UI.createDefault(map, defaultLayers);

// Biến toàn cục
let startMarker = null;
let endMarker = null;
let routes = [];
let maneuverMarkers = [];
let startCoords = null;
let endCoords = null;
let isSettingStartPoint = false;
let isSettingEndPoint = false;

// Danh sách các quận tại Hà Nội
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

// Bộ quản lý tốc độ gọi API để tránh lỗi 429
const apiRateLimiter = {
    queue: [],
    processing: false,
    delay: 500,
    add: function (fn) {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject });
            if (!this.processing) this.process();
        });
    },
    process: async function () {
        if (this.queue.length === 0) {
            this.processing = false;
            return;
        }
        this.processing = true;
        const { fn, resolve, reject } = this.queue.shift();
        try {
            const result = await fn();
            resolve(result);
        } catch (error) {
            reject(error);
        }
        await new Promise(r => setTimeout(r, this.delay));
        this.process();
    }
};

// Hàm tính khoảng cách giữa hai điểm tọa độ
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return parseFloat(distance.toFixed(3));
}

// Cập nhật thời gian
function updateCurrentTime() {
    const vietnamTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" });
    const localVietnamTime = new Date(vietnamTime);
    const year = localVietnamTime.getFullYear();
    const month = String(localVietnamTime.getMonth() + 1).padStart(2, '0');
    const day = String(localVietnamTime.getDate()).padStart(2, '0');
    const hours = String(localVietnamTime.getHours()).padStart(2, '0');
    const minutes = String(localVietnamTime.getMinutes()).padStart(2, '0');
    const formattedDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
    document.getElementById('departureTime').value = formattedDateTime;
    const displayTime = document.getElementById('currentTimeDisplay');
    if (displayTime) {
        displayTime.innerHTML = `<i class="fas fa-clock"></i> ${hours}:${minutes} ${day}/${month}/${year}`;
    }
}
setInterval(updateCurrentTime, 1000);
updateCurrentTime();

// Xóa các đối tượng trên bản đồ
function clearMapObjects() {
    routes.forEach(route => map.removeObject(route));
    maneuverMarkers.forEach(marker => map.removeObject(marker));
    if (startMarker) map.removeObject(startMarker);
    if (endMarker) map.removeObject(endMarker);
    routes = [];
    maneuverMarkers = [];
    startMarker = null;
    endMarker = null;
}

// Thêm marker vào bản đồ
function addMarkerToMap(position, icon) {
    const marker = new H.map.Marker(position, { icon });
    map.addObject(marker);
    return marker;
}

// Hàm chuyển đổi tọa độ thành địa chỉ
async function reverseGeocode(lat, lng, retries = 3) {
    return apiRateLimiter.add(async () => {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(
                    `https://revgeocode.search.hereapi.com/v1/revgeocode?at=${lat},${lng}&apikey=Gb_4_oj95K7LCSNQG-cp5Ub4TNfzvgpHDqnz6uz8q34`
                );
                if (!response.ok) {
                    throw new Error(`Lỗi HTTP! Mã trạng thái: ${response.status}`);
                }
                const data = await response.json();
                if (data && data.items && data.items.length > 0 && data.items[0].address && data.items[0].address.label) {
                    return data.items[0].address.label;
                } else {
                    console.warn(`Không lấy được địa chỉ cho tọa độ (${lat}, ${lng}), thử lại lần ${i + 1}/${retries}`);
                }
            } catch (error) {
                console.error(`Lỗi reverse geocoding:`, error);
                if (error.message.includes('429')) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        return `Điểm tại tọa độ (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
    });
}

// Hàm tìm tọa độ từ địa chỉ
async function geocodeAddress(address) {
    return apiRateLimiter.add(async () => {
        if (!address?.trim()) {
            alert("Vui lòng nhập địa chỉ hợp lệ!");
            return null;
        }
        try {
            const url = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(address)}&apikey=Gb_4_oj95K7LCSNQG-cp5Ub4TNfzvgpHDqnz6uz8q34`;
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Lỗi HTTP! Mã trạng thái: ${response.status}`);
            }
            const data = await response.json();
            if (data.items && data.items.length > 0) {
                const { lat, lng } = data.items[0].position;
                return [lat, lng];
            } else {
                alert("Không tìm thấy tọa độ của địa điểm này!");
                return null;
            }
        } catch (error) {
            console.error("Lỗi khi lấy tọa độ:", error);
            alert("Có lỗi xảy ra khi tìm tọa độ!");
            return null;
        }
    });
}

// Xử lý sự kiện click trên bản đồ
map.addEventListener('tap', async function (evt) {
    const coord = map.screenToGeo(evt.currentPointer.viewportX, evt.currentPointer.viewportY);
    if (isSettingStartPoint || isSettingEndPoint) {
        const isStart = isSettingStartPoint;
        const coords = [coord.lat, coord.lng];
        const marker = isStart ? startMarker : endMarker;
        if (marker) map.removeObject(marker);
        const icon = isStart
            ? new H.map.Icon('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#0072ce" stroke="white" stroke-width="2"/></svg>', { size: { w: 24, h: 24 } })
            : new H.map.Icon('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#d9534f" stroke="white" stroke-width="2"/></svg>', { size: { w: 24, h: 24 } });
        const newMarker = addMarkerToMap({ lat: coord.lat, lng: coord.lng }, icon);
        if (isStart) {
            startCoords = coords;
            startMarker = newMarker;
        } else {
            endCoords = coords;
            endMarker = newMarker;
        }
        const address = await reverseGeocode(coord.lat, coord.lng);
        document.getElementById(isStart ? 'startPoint' : 'endPoint').value = address;
        isSettingStartPoint = isSettingEndPoint = false;
    }
});

// Hàm tìm tọa độ từ địa chỉ đã nhập
async function findCoords(type) {
    const address = document.getElementById(`${type}Point`).value;
    if (!address?.trim()) {
        alert(`Vui lòng nhập địa chỉ điểm ${type === 'start' ? 'đi' : 'đến'}!`);
        return;
    }
    const coords = await geocodeAddress(address);
    if (coords) {
        const point = { lat: coords[0], lng: coords[1] };
        const marker = type === 'start' ? startMarker : endMarker;
        if (marker) map.removeObject(marker);
        const icon = type === 'start'
            ? new H.map.Icon('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#0072ce" stroke="white" stroke-width="2"/></svg>', { size: { w: 24, h: 24 } })
            : new H.map.Icon('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#d9534f" stroke="white" stroke-width="2"/></svg>', { size: { w: 24, h: 24 } });
        const newMarker = addMarkerToMap(point, icon);
        if (type === 'start') {
            startCoords = coords;
            startMarker = newMarker;
        } else {
            endCoords = coords;
            endMarker = newMarker;
        }
        map.setCenter(point);
    }
}

// Kiểm tra trạng thái backend
async function checkBackendStatus() {
    try {
        const response = await fetch('http://127.0.0.1:8000/health', { method: 'GET', mode: 'cors' });
        if (!response.ok) throw new Error('Backend không hoạt động');
        return true;
    } catch (error) {
        console.error('Lỗi kiểm tra trạng thái backend:', error.message);
        throw new Error('Không thể kết nối với backend API. Vui lòng kiểm tra lại.');
    }
}

// Hàm dịch hướng dẫn sang tiếng Việt
function translateInstruction(instruction) {
    let translated = instruction;
    translated = translated.replace("Turn left", "Rẽ trái");
    translated = translated.replace("Turn right", "Rẽ phải");
    translated = translated.replace("Turn slightly left", "Rẽ nhẹ sang trái");
    translated = translated.replace("Turn slightly right", "Rẽ nhẹ sang phải");
    translated = translated.replace("Continue on", "Tiếp tục trên");
    translated = translated.replace("Go for", "Đi thêm");
    translated = translated.replace("m.", "mét.");
    translated = translated.replace("onto", "vào");
    translated = translated.replace("toward", "hướng tới");
    return translated;
}

// Hàm chia quãng đường thành các đoạn nhỏ và dự đoán thời gian
async function predictSegmentedRoute(startLat, startLng, endLat, endLng, totalDistanceMeters, date, time) {
    const segmentDistance = 1000; // Chia thành các đoạn 1 km
    let totalDuration = 0;
    let remainingDistance = totalDistanceMeters;
    let currentLat = startLat;
    let currentLng = startLng;

    // Tính tỷ lệ để di chuyển từ điểm bắt đầu đến điểm kết thúc
    const totalDistanceKm = calculateDistance(startLat, startLng, endLat, endLng);
    const segments = [];
    let accumulatedDistance = 0;

    while (remainingDistance > 0) {
        const segmentDistanceMeters = Math.min(segmentDistance, remainingDistance);
        accumulatedDistance += segmentDistanceMeters;

        // Tính tọa độ của điểm kết thúc đoạn
        const fraction = accumulatedDistance / (totalDistanceMeters || 1); // Tránh chia cho 0
        const segmentEndLat = startLat + (endLat - startLat) * fraction;
        const segmentEndLng = startLng + (endLng - startLng) * fraction;

        // Gọi API dự đoán cho đoạn này
        const response = await fetch('http://127.0.0.1:8000/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start_lat: currentLat,
                start_lng: currentLng,
                end_lat: segmentEndLat,
                end_lng: segmentEndLng,
                distance_m: segmentDistanceMeters,
                date: date,
                time: time
            }),
            mode: 'cors'
        });
        if (!response.ok) throw new Error(`API dự đoán trả về lỗi: ${response.status}`);
        const result = await response.json();
        const segmentDuration = result.predicted_duration_seconds;

        segments.push({
            startLat: currentLat,
            startLng: currentLng,
            endLat: segmentEndLat,
            endLng: segmentEndLng,
            distance: segmentDistanceMeters,
            duration: segmentDuration
        });

        totalDuration += segmentDuration;
        remainingDistance -= segmentDistanceMeters;
        currentLat = segmentEndLat;
        currentLng = segmentEndLng;
    }

    return { totalDuration, segments };
}

// Xử lý tìm đường
document.getElementById('findRouteBtn').addEventListener('click', async () => {
    try {
        const startPoint = document.getElementById('startPoint').value;
        const endPoint = document.getElementById('endPoint').value;
        const departureTime = document.getElementById('departureTime').value;

        if (!startPoint || !endPoint || !departureTime) {
            alert('Vui lòng nhập đầy đủ thông tin!');
            return;
        }
        if (!startCoords || !endCoords) {
            alert('Vui lòng chọn cả điểm đi và điểm đến!');
            return;
        }

        clearMapObjects();
        document.getElementById('routeDetailsContent').innerHTML = '<p class="text-center">Đang tính toán...</p>';

        // Tính tuyến đường
        const routingService = platform.getRoutingService(null, 8);
        const routingParameters = {
            routingMode: 'fast',
            transportMode: 'car',
            origin: `${startCoords[0]},${startCoords[1]}`,
            destination: `${endCoords[0]},${endCoords[1]}`,
            return: 'polyline,summary,actions,instructions',
            departureTime: new Date(departureTime).toISOString(),
            lang: 'vi-VN',
            traffic: 'live'
        };

        const result = await new Promise((resolve, reject) => {
            routingService.calculateRoute(
                routingParameters,
                (result) => {
                    if (result.routes && result.routes.length > 0) {
                        resolve(result.routes[0]);
                    } else {
                        reject(new Error('Không thể tìm tuyến đường'));
                    }
                },
                (error) => reject(error)
            );
        });

        const routeSection = result.sections[0];
        const totalDistanceMeters = routeSection.summary.length;

        // Hiển thị tuyến đường
        const routeLine = H.geo.LineString.fromFlexiblePolyline(routeSection.polyline);
        const polyline = new H.map.Polyline(routeLine, {
            style: { lineWidth: 4, strokeColor: 'rgba(0, 114, 206, 0.7)' }
        });
        map.addObject(polyline);
        routes.push(polyline);

        // Thêm marker
        const startIcon = new H.map.Icon('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#0072ce" stroke="white" stroke-width="2"/></svg>', { size: { w: 24, h: 24 } });
        const endIcon = new H.map.Icon('<svg xmlns="http-command://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#d9534f" stroke="white" stroke-width="2"/></svg>', { size: { w: 24, h: 24 } });
        startMarker = addMarkerToMap({ lat: startCoords[0], lng: startCoords[1] }, startIcon);
        endMarker = addMarkerToMap({ lat: endCoords[0], lng: endCoords[1] }, endIcon);

        // Tự động đặt tầm nhìn bản đồ
        map.getViewModel().setLookAtData({ bounds: polyline.getBoundingBox() });

        // Lấy tọa độ các điểm trên tuyến đường
        const polylineCoords = [];
        for (let i = 0; i < routeLine.getPointCount(); i++) {
            const point = routeLine.extractPoint(i);
            polylineCoords.push(point.lat, point.lng, 0);
        }

        // Hiển thị các điểm hướng dẫn
        const maneuvers = routeSection.actions || [];
        let instructionsHTML = `<ul style="list-style-type: none; padding-left: 0;">`;
        for (const [maneuverIndex, maneuver] of maneuvers.entries()) {
            if (!maneuver || typeof maneuver.offset !== 'number') continue;
            const offset = maneuver.offset;
            let instruction = maneuver.instruction || "Không có hướng dẫn";
            if (!instruction.includes("Rẽ") && !instruction.includes("Tiếp tục")) {
                instruction = translateInstruction(instruction);
            }
            const coordIndex = offset * 3;
            if (coordIndex >= polylineCoords.length) continue;
            const lat = polylineCoords[coordIndex];
            const lng = polylineCoords[coordIndex + 1];
            if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) continue;
            instructionsHTML += `<li style="margin-bottom: 5px;">${maneuverIndex + 1}. ${instruction}</li>`;
            const maneuverDot = new H.map.Circle(
                { lat: lat, lng: lng },
                15,
                {
                    style: {
                        fillColor: 'rgba(255, 255, 255, 1)',
                        strokeColor: 'rgba(255, 255, 255, 1)',
                        lineWidth: 1
                    },
                    volatility: true
                }
            );
            maneuverDot.addEventListener('tap', function (evt) {
                ui.getBubbles().forEach(bubble => ui.removeBubble(bubble));
                const bubble = new H.ui.InfoBubble(
                    { lat: lat, lng: lng },
                    {
                        content: `<div style="padding: 10px; font-size: 14px;">${instruction}</div>`,
                        style: {
                            backgroundColor: 'blue',
                            color: 'white'
                        }
                    }
                );
                ui.addBubble(bubble);
            });
            map.addObject(maneuverDot);
            maneuverMarkers.push(maneuverDot);
        }
        instructionsHTML += `</ul>`;

        // Dự đoán thời gian với chia đoạn
        const [date, time] = departureTime.split('T');
        const timeFormatted = time + ':00';
        await checkBackendStatus(); // Kiểm tra backend trước khi dự đoán
        const prediction = await predictSegmentedRoute(
            startCoords[0], startCoords[1],
            endCoords[0], endCoords[1],
            totalDistanceMeters, date, timeFormatted
        );
        const totalDuration = prediction.totalDuration;

        // Hiển thị thông tin tuyến đường
        const distanceKm = (totalDistanceMeters / 1000).toFixed(2);
        const durationMinutes = (totalDuration / 60).toFixed(0);
        const hours = Math.floor(durationMinutes / 60);
        const minutes = durationMinutes % 60;
        let durationText = hours > 0 ? `${hours} giờ ${minutes} phút` : `${minutes} phút`;
        const avgSpeed = ((totalDistanceMeters / 1000) / (totalDuration / 3600)).toFixed(1);

        document.getElementById('routeDetailsContent').innerHTML = `
            <p><strong><i class="fas fa-road"></i> Khoảng cách:</strong> ${distanceKm} km</p>
            <p><strong><i class="fas fa-clock"></i> Thời gian dự đoán:</strong> ${durationText}</p>
            <p><strong><i class="fas fa-tachometer-alt"></i> Tốc độ trung bình:</strong> ${avgSpeed} km/h</p>
            <details>
                <summary>Hướng dẫn chi tiết</summary>
                ${instructionsHTML}
            </details>
        `;
    } catch (error) {
        console.error('Lỗi:', error);
        document.getElementById('routeDetailsContent').innerHTML = 
            `<p class="text-danger"><i class="fas fa-exclamation-triangle"></i> Lỗi: ${error.message}</p>`;
    }
});

// Lấy vị trí hiện tại
function getCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const currentLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                clearMapObjects();
                const locationIcon = new H.map.Icon('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#4285F4" stroke="white" stroke-width="2"/></svg>', { size: { w: 24, h: 24 } });
                startMarker = addMarkerToMap(currentLocation, locationIcon);
                map.setCenter(currentLocation);
                map.setZoom(14);
                const address = await reverseGeocode(currentLocation.lat, currentLocation.lng);
                document.getElementById('startPoint').value = address;
                startCoords = [currentLocation.lat, currentLocation.lng];
            },
            (error) => {
                console.error('Lỗi định vị:', error);
                alert('Không thể xác định vị trí hiện tại của bạn.');
            }
        );
    } else {
        alert('Trình duyệt của bạn không hỗ trợ định vị.');
    }
}

// Sự kiện chọn điểm trên bản đồ
document.getElementById('setStartPointBtn').addEventListener('click', () => {
    isSettingStartPoint = true;
    isSettingEndPoint = false;
    alert('Nhấp vào bản đồ để chọn điểm xuất phát.');
});

document.getElementById('setEndPointBtn').addEventListener('click', () => {
    isSettingEndPoint = true;
    isSettingStartPoint = false;
    alert('Nhấp vào bản đồ để chọn điểm đến.');
});

// Tìm tọa độ khi nhấn Enter
document.getElementById('startPoint').addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') await findCoords('start');
});

document.getElementById('endPoint').addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') await findCoords('end');
});

// Gắn sự kiện cho nút vị trí hiện tại
document.getElementById('myLocationBtn').addEventListener('click', getCurrentLocation);