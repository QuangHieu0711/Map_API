// Khởi tạo bản đồ Here Maps
const platform = new H.service.Platform({
    apikey: 'NPd4fTB07-VYUx076XITerHjzInRos_3u4IGkBiW0zY'
});

const defaultLayers = platform.createDefaultLayers();
const map = new H.Map(document.getElementById('map'), defaultLayers.vector.normal.map, {
    center: { lat: 21.0278, lng: 105.8342 },
    zoom: 13
});
const ui = H.ui.UI.createDefault(map, defaultLayers);
const behavior = new H.mapevents.Behavior(new H.mapevents.MapEvents(map));

let startMarker, endMarker, routes = [], maneuverMarkers = [];
let startCoords, endCoords;
let isSettingStartPoint = false;
let isSettingEndPoint = false;
let lastSentData = null;

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

// Bộ quản lý tốc độ gọi API để tránh lỗi 429 Too Many Requests
const apiRateLimiter = {
    queue: [],
    processing: false,
    delay: 500, // ms giữa các yêu cầu

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

// Hàm dịch hướng dẫn sang tiếng Việt (dùng nếu API không trả về tiếng Việt)
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

// Hàm tính khoảng cách giữa hai điểm tọa độ (thay thế H.geo.Point.distance)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Bán kính trái đất (km)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return parseFloat(distance.toFixed(3)); // Trả về số, làm tròn 3 chữ số
}

// Hàm tạo ngẫu nhiên tọa độ trong một quận
function getRandomCoordsInDistrict() {
    const districtIndex = Math.floor(Math.random() * districts.length);
    const district = districts[districtIndex];

    const lat = Math.random() * (district.latRange[1] - district.latRange[0]) + district.latRange[0];
    const lng = Math.random() * (district.lngRange[1] - district.lngRange[0]) + district.lngRange[0];

    return { coords: [lat, lng], district: district.name };
}

// Hàm cập nhật thời gian khởi hành vào input datetime-local (chỉ chạy một lần khi mở bản đồ)
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
        displayTime.textContent = `Thời gian khởi hành: ${hours}:${minutes} ${day}/${month}/${year}`;
    }
}

// Hàm chuyển đổi tọa độ thành địa chỉ (sửa thành async/await với retry và sử dụng rate limiter)
async function reverseGeocode(lat, lng, retries = 3) {
    return apiRateLimiter.add(async () => {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch(`https://revgeocode.search.hereapi.com/v1/revgeocode?at=${lat},${lng}&apikey=NPd4fTB07-VYUx076XITerHjzInRos_3u4IGkBiW0zY`);

                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }

                const data = await response.json();

                // Kiểm tra kỹ dữ liệu trả về
                if (data && data.items && data.items.length > 0 && data.items[0].address && data.items[0].address.label) {
                    return data.items[0].address.label;
                } else {
                    console.warn(`Không lấy được địa chỉ cho tọa độ (${lat}, ${lng}), thử lại lần ${i + 1}/${retries}`);
                }
            } catch (error) {
                console.error(`Lỗi reverse geocoding cho tọa độ (${lat}, ${lng}):`, error);
                // Nếu là lỗi 429, đợi lâu hơn
                if (error.message.includes('429')) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }

            // Đợi trước khi thử lại
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Nếu không lấy được địa chỉ, trả về tọa độ dưới dạng chuỗi
        return `Điểm tại tọa độ (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
    });
}

// Hàm tìm tọa độ từ địa chỉ (sửa thành async/await và sử dụng rate limiter)
async function geocodeAddress(address) {
    return apiRateLimiter.add(async () => {
        if (!address?.trim()) {
            alert("Vui lòng nhập địa chỉ hợp lệ!");
            return null;
        }

        try {
            const url = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(address)}&apikey=NPd4fTB07-VYUx076XITerHjzInRos_3u4IGkBiW0zY`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
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
        const newMarker = new H.map.Marker(coord);
        map.addObject(newMarker);

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
}

// Hàm chọn ngẫu nhiên điểm đi và điểm đến trong các quận của Hà Nội
async function getRandomPoints() {
    const startPoint = getRandomCoordsInDistrict();
    let endPoint;

    do {
        endPoint = getRandomCoordsInDistrict();
    } while (endPoint.district === startPoint.district);

    const startAddress = await reverseGeocode(startPoint.coords[0], startPoint.coords[1]);
    const endAddress = await reverseGeocode(endPoint.coords[0], endPoint.coords[1]);

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

// Hàm tính toán và vẽ tuyến đường (sửa để tăng departureTime thêm 10 phút sau mỗi lần xử lý)
async function calculateAndDrawRoute(startCoords, endCoords, startPointAddress, endPointAddress) {
    if (!startCoords || !endCoords) {
        alert("Vui lòng chọn cả điểm đi và điểm đến!");
        return;
    }

    try {
        // Xóa tất cả các đối tượng trên bản đồ (routes, markers)
        routes.forEach(route => map.removeObject(route));
        maneuverMarkers.forEach(marker => map.removeObject(marker));
        if (startMarker) map.removeObject(startMarker);
        if (endMarker) map.removeObject(endMarker);
        routes = [];
        maneuverMarkers = [];
        startMarker = null;
        endMarker = null;
        document.getElementById("routeDetailsContent").innerHTML = "";

        const departureTime = document.getElementById('departureTime').value;
        if (!departureTime) {
            alert("Vui lòng nhập thời gian khởi hành!");
            return;
        }

        const departureTimeDate = new Date(departureTime);
        const date = departureTimeDate.toISOString().split('T')[0];
        const hours = String(departureTimeDate.getHours()).padStart(2, '0');
        const minutes = String(departureTimeDate.getMinutes()).padStart(2, '0');
        const seconds = String(departureTimeDate.getSeconds()).padStart(2, '0');
        const formattedTime = `${hours}:${minutes}:${seconds}`;

        const routingParameters = {
            transportMode: 'scooter',
            origin: `${startCoords[0]},${startCoords[1]}`,
            destination: `${endCoords[0]},${endCoords[1]}`,
            return: 'polyline,summary,actions,instructions',
            alternatives: 2,
            departureTime: departureTimeDate.toISOString(),
            lang: 'vi-VN',
            traffic: 'live'
        };

        const router = platform.getRoutingService(null, 8);

        const result = await new Promise((resolve, reject) => {
            router.calculateRoute(routingParameters, resolve,
                error => {
                    console.error("Lỗi khi tính tuyến đường:", error);
                    reject(error);
                }
            );
        });

        if (!result.routes || result.routes.length === 0) {
            alert("Không thể tìm đường đi giữa hai điểm này!");
            return;
        }

        const colors = ["blue", "green", "red"];
        let routesToSend = [];

        const limitedRoutes = result.routes.slice(0, 3);

        for (const [index, routeData] of limitedRoutes.entries()) {
            if (!routeData.sections || routeData.sections.length === 0) continue;

            try {
                const routeSection = routeData.sections[0];

                if (!routeSection.polyline) {
                    console.error("Không có dữ liệu polyline cho tuyến đường:", index);
                    continue;
                }

                const routeShape = routeSection.polyline;
                const linestring = H.geo.LineString.fromFlexiblePolyline(routeShape);
                const polyline = new H.map.Polyline(linestring, {
                    style: { strokeColor: colors[index], lineWidth: 5 }
                });

                const polylineCoords = [];
                for (let i = 0; i < linestring.getPointCount(); i++) {
                    const point = linestring.extractPoint(i);
                    polylineCoords.push(point.lat, point.lng, 0);
                }

                map.addObject(polyline);
                routes.push(polyline);
                map.getViewModel().setLookAtData({ bounds: polyline.getBoundingBox() });

                startMarker = new H.map.Marker({ lat: startCoords[0], lng: startCoords[1] });
                endMarker = new H.map.Marker({ lat: endCoords[0], lng: endCoords[1] });
                map.addObject(startMarker);
                map.addObject(endMarker);

                const maneuvers = routeSection.actions || [];
                let instructionsHTML = `<ul style="list-style-type: none; padding-left: 0;">`;
                const routePoints = [];

                let lastLat = startCoords[0];
                let lastLng = startCoords[1];
                let lastAddress = startPointAddress;

                for (const [maneuverIndex, maneuver] of maneuvers.entries()) {
                    if (!maneuver || typeof maneuver.offset !== 'number') {
                        console.warn("Maneuver không hợp lệ:", maneuver);
                        continue;
                    }

                    const offset = maneuver.offset;
                    let instruction = maneuver.instruction || "Không có hướng dẫn";

                    if (!instruction.includes("Rẽ") && !instruction.includes("Tiếp tục")) {
                        instruction = translateInstruction(instruction);
                    }

                    const coordIndex = offset * 3;
                    if (coordIndex >= polylineCoords.length) {
                        console.warn(`Offset ${offset} vượt quá kích thước mảng tọa độ ${polylineCoords.length / 3}`);
                        continue;
                    }

                    const lat = polylineCoords[coordIndex];
                    const lng = polylineCoords[coordIndex + 1];

                    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
                        console.warn(`Tọa độ không hợp lệ tại offset ${offset}: ${lat}, ${lng}`);
                        continue;
                    }

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
                                    backgroundColor: colors[index],
                                    color: 'white'
                                }
                            }
                        );
                        ui.addBubble(bubble);
                    });

                    map.addObject(maneuverDot);
                    maneuverMarkers.push(maneuverDot);

                    const address = await reverseGeocode(lat, lng);

                    // Calculate segment distance in meters
                    let segmentDistanceMeters = 0; // Default value
                    if (typeof maneuver.length === 'number' && !isNaN(maneuver.length) && maneuver.length > 0) {
                        segmentDistanceMeters = maneuver.length; // Sử dụng từ HERE API
                    } else {
                        // Tính khoảng cách từ tọa độ
                        const segmentDistanceKm = calculateDistance(lastLat, lastLng, lat, lng);
                        segmentDistanceMeters = Math.round(segmentDistanceKm * 1000);
                        
                        // Đảm bảo khoảng cách tối thiểu 1m nếu tọa độ khác nhau
                        if (segmentDistanceMeters < 1 && (lastLat !== lat || lastLng !== lng)) {
                            segmentDistanceMeters = 1;
                        }
                    }

                    const segmentDuration = typeof maneuver.duration === 'number' && !isNaN(maneuver.duration) && maneuver.duration > 0 
                        ? Math.round(maneuver.duration) 
                        : Math.round(segmentDistanceMeters / 8.33);
                    const segmentTrafficDuration = typeof maneuver.trafficDuration === 'number' && !isNaN(maneuver.trafficDuration) 
                        ? Math.round(maneuver.trafficDuration) 
                        : segmentDuration;

                    // Calculate speed using the formula: Speed (km/h) = (Distance (m) * 3.6) / Duration (s)
                    let segmentSpeed = 0;
                    if (segmentDuration > 0 && segmentDistanceMeters > 0) {
                        segmentSpeed = ((segmentDistanceMeters * 3.6) / segmentDuration).toFixed(2);
                    }

                    // Log để kiểm tra
                    console.log(`Segment ${maneuverIndex + 1}: Distance = ${segmentDistanceMeters} m, Duration = ${segmentDuration} s, Speed = ${segmentSpeed} km/h`);

                    const segmentDirection = `Từ ${lastAddress} đến ${address}`;

                    routePoints.push({
                        startLat: lastLat,
                        startLng: lastLng,
                        startAddress: lastAddress,
                        endLat: lat,
                        endLng: lng,
                        endAddress: address,
                        direction: segmentDirection,
                        segmentDistance: segmentDistanceMeters, // Store in meters
                        duration: segmentDuration,
                        trafficDuration: segmentTrafficDuration,
                        speed: parseFloat(segmentSpeed) || 0 // Ensure speed is a number
                    });

                    lastLat = lat;
                    lastLng = lng;
                    lastAddress = address;
                }

                // Handle the final segment to the destination
                if (lastLat !== endCoords[0] || lastLng !== endCoords[1]) {
                    let segmentDistanceMeters = 0;
                    if (typeof lastLat === 'number' && typeof lastLng === 'number' && !isNaN(lastLat) && !isNaN(lastLng)) {
                        const segmentDistanceKm = calculateDistance(lastLat, lastLng, endCoords[0], endCoords[1]);
                        if (typeof segmentDistanceKm === 'number' && !isNaN(segmentDistanceKm)) {
                            segmentDistanceMeters = Math.round(segmentDistanceKm * 1000); // Convert km to meters
                        } else {
                            console.warn(`Không thể tính khoảng cách giữa (${lastLat}, ${lastLng}) và (${endCoords[0]}, ${endCoords[1]})`);
                            segmentDistanceMeters = 1; // Đặt giá trị tối thiểu để tránh chia cho 0
                        }
                    } else {
                        console.warn(`Tọa độ không hợp lệ: lastLat=${lastLat}, lastLng=${lastLng}`);
                        segmentDistanceMeters = 1; // Đặt giá trị tối thiểu
                    }
                
                    // Sửa phần tính thời gian: tốc độ trung bình 30km/h = 8.33m/s
                    const avgSpeedMps = 8.33; // 30km/h = 8.33m/s
                    
                    // Tính thời gian di chuyển dự kiến (giây)
                    const segmentDuration = Math.max(1, Math.round(segmentDistanceMeters / avgSpeedMps));
                    const segmentTrafficDuration = segmentDuration; // Giả định không có tắc nghẽn giao thông
                    
                    // Đảm bảo thời gian không quá lớn cho đoạn đường ngắn
                    const maxReasonableDuration = Math.min(60, segmentDuration); // Giới hạn tối đa 60 giây cho đoạn cuối
                
                    // Calculate speed for the final segment
                    let segmentSpeed = segmentDistanceMeters > 0 ? ((segmentDistanceMeters / maxReasonableDuration) * 3.6) : 30;
                    
                    // Log để kiểm tra
                    console.log(`Final Segment (đã hiệu chỉnh): Distance = ${segmentDistanceMeters} m, Duration = ${maxReasonableDuration} s, Speed = ${segmentSpeed.toFixed(2)} km/h`);
                
                    const segmentDirection = `Từ ${lastAddress} đến ${endPointAddress}`;
                
                    routePoints.push({
                        startLat: lastLat,
                        startLng: lastLng,
                        startAddress: lastAddress,
                        endLat: endCoords[0],
                        endLng: endCoords[1],
                        endAddress: endPointAddress,
                        direction: segmentDirection,
                        segmentDistance: segmentDistanceMeters, // Store in meters
                        duration: maxReasonableDuration, // Sử dụng thời gian đã giới hạn
                        trafficDuration: maxReasonableDuration, // Sử dụng thời gian đã giới hạn
                        speed: parseFloat(segmentSpeed.toFixed(2)) // Đảm bảo tốc độ là số thực có 2 chữ số thập phân
                    });
                }

                instructionsHTML += `</ul>`;

                // Total distance in meters for the Routes table
                const totalDistanceMeters = routeSection.summary.length; // Already in meters from HERE API
                const totalDistanceKm = (totalDistanceMeters / 1000).toFixed(2); // For display purposes
                const travelTimeSec = routeSection.summary.duration;
                const travelTimeMin = Math.floor(travelTimeSec / 60);
                const travelTimeSecRemaining = Math.floor(travelTimeSec % 60);

                routesToSend.push({
                    date: date,
                    time: formattedTime,
                    startPoint: startPointAddress,
                    endPoint: endPointAddress,
                    distance: totalDistanceMeters, // Store in meters for Routes table
                    travelTime: travelTimeMin * 60 + travelTimeSecRemaining,
                    points: routePoints.map(point => ({
                        startLat: point.startLat,
                        startLng: point.startLng,
                        startAddress: point.startAddress,
                        endLat: point.endLat,
                        endLng: point.endLng,
                        endAddress: point.endAddress,
                        direction: point.direction,
                        distance: point.segmentDistance, // Already in meters
                        duration: point.duration,
                        trafficDuration: point.trafficDuration,
                        speed: point.speed // Use the calculated speed
                    }))
                });

                const routeSummary = `
                    <div style="color: ${colors[index]};">
                        <p>
                            🔹 <strong>Tuyến đường ${index + 1}:</strong> 
                            ${totalDistanceKm} km - ${travelTimeMin} phút ${travelTimeSecRemaining} giây
                        </p>
                        <details>
                            <summary>Hướng dẫn chi tiết</summary>
                            ${instructionsHTML}
                        </details>
                    </div>
                `;
                const routeDetailsContent = document.getElementById("routeDetailsContent");
                if (routeDetailsContent) {
                    routeDetailsContent.innerHTML += routeSummary;
                } else {
                    console.error("Phần tử routeDetailsContent không tồn tại trong HTML!");
                }
            } catch (error) {
                console.error(`Lỗi khi xử lý tuyến đường ${index}:`, error);
            }
        }

        // Gửi dữ liệu lên server
        if (routesToSend.length > 0) {
            const routesToCompare = routesToSend.map(route => ({
                date: route.date,
                time: route.time,
                startPoint: route.startPoint,
                endPoint: route.endPoint,
                distance: route.distance,
                travelTime: route.travelTime
            }));
            const currentDataString = JSON.stringify(routesToCompare);

            if (lastSentData !== currentDataString) {
                // Kiểm tra dữ liệu trước khi gửi
                routesToSend.forEach(route => {
                    route.points.forEach(point => {
                        if (typeof point.distance !== 'number' || isNaN(point.distance)) {
                            console.warn("Distance không hợp lệ:", point.distance);
                            point.distance = 0;
                        }
                        if (typeof point.duration !== 'number' || isNaN(point.duration)) {
                            console.warn("Duration không hợp lệ:", point.duration);
                            point.duration = 0;
                        }
                        if (typeof point.trafficDuration !== 'number' || isNaN(point.trafficDuration)) {
                            console.warn("TrafficDuration không hợp lệ:", point.trafficDuration);
                            point.trafficDuration = point.duration;
                        }
                        if (typeof point.speed !== 'number' || isNaN(point.speed)) {
                            console.warn("Speed không hợp lệ:", point.speed);
                            point.speed = 0;
                        }
                    });
                });

                try {
                    const response = await fetch('http://localhost:3000/save-route', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(routesToSend)
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! Status: ${response.status}`);
                    }

                    const data = await response.json();
                    console.log('Dữ liệu đã được lưu:', data);
                    lastSentData = currentDataString;

                    // Tăng departureTime thêm 10 phút
                    departureTimeDate.setMinutes(departureTimeDate.getMinutes() + 10);
                    const year = departureTimeDate.getFullYear();
                    const month = String(departureTimeDate.getMonth() + 1).padStart(2, '0');
                    const day = String(departureTimeDate.getDate()).padStart(2, '0');
                    const hours = String(departureTimeDate.getHours()).padStart(2, '0');
                    const minutes = String(departureTimeDate.getMinutes()).padStart(2, '0');
                    const formattedDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
                    document.getElementById('departureTime').value = formattedDateTime;

                    const displayTime = document.getElementById('currentTimeDisplay');
                    if (displayTime) {
                        displayTime.textContent = `Thời gian khởi hành: ${hours}:${minutes} ${day}/${month}/${year}`;
                    }
                } catch (error) {
                    console.error('Lỗi khi gửi dữ liệu:', error);
                    alert('Không thể gửi dữ liệu đến server. Vui lòng kiểm tra kết nối!');
                }
            } else {
                console.log('Dữ liệu đã được gửi trước đó, không gửi lại.');
            }
        } else {
            console.log('Không có tuyến đường nào để gửi.');
        }
    } catch (error) {
        console.error("Lỗi tính đường đi:", error);
        alert("Đã xảy ra lỗi khi tính đường đi! Vui lòng thử lại sau.");
    }
}

// Hàm tạo tuyến đường ngẫu nhiên và lưu vào cơ sở dữ liệu
async function generateRandomRoute() {
    try {
        const points = await getRandomPoints();
        startCoords = points.start.coords;
        endCoords = points.end.coords;

        document.getElementById('startPoint').value = points.start.address;
        document.getElementById('endPoint').value = points.end.address;

        await calculateAndDrawRoute(startCoords, endCoords, points.start.address, points.end.address);
    } catch (error) {
        console.error("Lỗi khi tạo tuyến đường ngẫu nhiên:", error);
        alert("Đã xảy ra lỗi khi tạo tuyến đường ngẫu nhiên!");
    }
}

// Lấy vị trí hiện tại
async function getCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            async function (position) {
                let lat = position.coords.latitude;
                let lng = position.coords.longitude;
                let currentCoords = { lat: lat, lng: lng };

                let currentMarker = new H.map.Marker(currentCoords);
                map.addObject(currentMarker);
                map.setCenter(currentCoords);
                map.setZoom(14);

                const address = await reverseGeocode(lat, lng);
                document.getElementById('startPoint').value = address;

                startCoords = [lat, lng];
                startMarker = currentMarker;
            },
            function (error) {
                alert("Không thể lấy vị trí! Hãy kiểm tra cài đặt trình duyệt.");
                console.error("Lỗi Geolocation:", error);
            }
        );
    } else {
        alert("Trình duyệt của bạn không hỗ trợ Geolocation!");
    }
}

// Khởi tạo sự kiện khi trang tải xong
document.addEventListener('DOMContentLoaded', () => {
    updateCurrentTime();

    document.getElementById('findRouteBtn').addEventListener('click', async () => {
        const startAddress = document.getElementById('startPoint').value;
        const endAddress = document.getElementById('endPoint').value;

        if (!startCoords || !endCoords) {
            alert("Vui lòng chọn cả điểm đi và điểm đến!");
            return;
        }

        if (!startAddress || !endAddress) {
            alert("Địa chỉ điểm đi hoặc điểm đến không được để trống!");
            return;
        }

        await calculateAndDrawRoute(startCoords, endCoords, startAddress, endAddress);
    });

    document.getElementById('setStartPointBtn').addEventListener('click', () => {
        isSettingStartPoint = true;
        isSettingEndPoint = false;
        alert("Nhấp vào bản đồ để chọn điểm đi.");
    });

    document.getElementById('setEndPointBtn').addEventListener('click', () => {
        isSettingEndPoint = true;
        isSettingStartPoint = false;
        alert("Nhấp vào bản đồ để chọn điểm đến.");
    });

    document.getElementById('startPoint').addEventListener('keypress', async e => {
        if (e.key === 'Enter') await findCoords('start');
    });

    document.getElementById('endPoint').addEventListener('keypress', async e => {
        if (e.key === 'Enter') await findCoords('end');
    });

    document.getElementById('randomRouteBtn').addEventListener('click', generateRandomRoute);
});