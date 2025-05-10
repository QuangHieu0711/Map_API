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
        displayTime.textContent = `Thời gian hiện tại: ${hours}:${minutes} ${day}/${month}/${year}`;
    }
}

// Hàm chuyển đổi tọa độ thành địa chỉ
function reverseGeocode(lat, lng, callback) {
    fetch(`https://revgeocode.search.hereapi.com/v1/revgeocode?at=${lat},${lng}&apikey=obtUNXXVNEw-lseLFfxlrirLW8Z8Zn578K8fTYSJnXQ`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data && data.items && data.items.length > 0) {
                callback(data.items[0].address.label);
            } else {
                console.warn("Không có kết quả reverse geocoding cho tọa độ:", lat, lng);
                callback("Không thể xác định địa chỉ");
            }
        })
        .catch(error => {
            console.error("Lỗi reverse geocoding:", error);
            callback("Không thể xác định địa chỉ");
        });
}

// Hàm tìm tọa độ từ địa chỉ
function geocodeAddress(address, callback) {
    if (!address?.trim()) {
        alert("Vui lòng nhập địa chỉ hợp lệ!");
        callback(null);
        return;
    }

    const url = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(address)}&apikey=obtUNXXVNEw-lseLFfxlrirLW8Z8Zn578K8fTYSJnXQ`;

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

// Hàm chọn ngẫu nhiên điểm đi và điểm đến trong các quận của Hà Nội
async function getRandomPoints() {
    const startPoint = getRandomCoordsInDistrict();
    let endPoint;

    do {
        endPoint = getRandomCoordsInDistrict();
    } while (endPoint.district === startPoint.district);

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

// Hàm tính toán và vẽ tuyến đường (phần sửa đổi cho xe máy)
function calculateAndDrawRoute(startCoords, endCoords, startPointAddress, endPointAddress) {
    // Kiểm tra xem điểm đi và điểm đến có được cung cấp hay không
    if (!startCoords || !endCoords) {
        alert("Vui lòng chọn cả điểm đi và điểm đến!");
        return;
    }

    // Xóa các tuyến đường và marker cũ trên bản đồ
    routes.forEach(route => map.removeObject(route));
    maneuverMarkers.forEach(marker => map.removeObject(marker));
    if (startMarker) map.removeObject(startMarker);
    if (endMarker) map.removeObject(endMarker);
    routes = [];
    maneuverMarkers = [];
    document.getElementById("routeDetailsContent").innerHTML = "";

    // Lấy thời gian hiện tại theo giờ Việt Nam
    const vietnamTime = new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" });
    const currentTime = new Date(vietnamTime);
    const hours = String(currentTime.getHours()).padStart(2, '0');
    const minutes = String(currentTime.getMinutes()).padStart(2, '0');
    const seconds = String(currentTime.getSeconds()).padStart(2, '0');
    const formattedTime = `${hours}:${minutes}:${seconds}`;

    // Lấy thời gian xuất phát từ input, nếu không có thì dùng thời gian hiện tại
    const departureTime = document.getElementById('departureTime').value;
    const routingParameters = {
        transportMode: 'scooter', // Chế độ di chuyển bằng xe máy
        origin: `${startCoords[0]},${startCoords[1]}`, // Tọa độ điểm xuất phát
        destination: `${endCoords[0]},${endCoords[1]}`, // Tọa độ điểm đến
        return: 'polyline,summary,actions,instructions', // Dữ liệu trả về từ API
        alternatives: 2, // Yêu cầu 3 tuyến đường thay thế
        departureTime: departureTime ? new Date(departureTime).toISOString() : new Date().toISOString(),
        lang: 'vi-VN' // Ngôn ngữ hướng dẫn: tiếng Việt
    };

    // Khởi tạo dịch vụ định tuyến từ HERE Maps
    const router = platform.getRoutingService(null, 8);

    // Gọi API để tính toán tuyến đường
    router.calculateRoute(
        routingParameters,
        (result) => {
            // Kiểm tra xem có tuyến đường nào được trả về không
            if (result.routes.length > 0) {
                const colors = ["blue", "green", "red"]; // Màu sắc cho từng tuyến đường
                let routesToSend = []; // Dữ liệu tuyến đường để gửi về server

                // Giới hạn tối đa 3 tuyến đường
                const limitedRoutes = result.routes.slice(0, 3);

                // Xử lý từng tuyến đường
                limitedRoutes.forEach((routeData, index) => {
                    if (routeData.sections.length > 0) {
                        // Lấy thông tin hình dạng tuyến đường từ polyline
                        const routeShape = routeData.sections[0].polyline;
                        const linestring = H.geo.LineString.fromFlexiblePolyline(routeShape);
                        const polyline = new H.map.Polyline(linestring, {
                            style: { 
                                strokeColor: colors[index], 
                                lineWidth: 5 
                            }
                        });

                        // Lấy tọa độ của tuyến đường
                        const polylineCoords = linestring.getLatLngAltArray();

                        // Thêm tuyến đường vào bản đồ
                        map.addObject(polyline);
                        routes.push(polyline);
                        map.getViewModel().setLookAtData({ bounds: polyline.getBoundingBox() });

                        // Thêm marker cho điểm xuất phát và điểm đến
                        startMarker = new H.map.Marker({ lat: startCoords[0], lng: startCoords[1] });
                        endMarker = new H.map.Marker({ lat: endCoords[0], lng: endCoords[1] });
                        map.addObject(startMarker);
                        map.addObject(endMarker);

                        // Xử lý các bước di chuyển (maneuvers)
                        const maneuvers = routeData.sections[0].actions || [];
                        let instructionsHTML = `<ul style="list-style-type: none; padding-left: 0;">`;

                        maneuvers.forEach((maneuver, maneuverIndex) => {
                            const offset = maneuver.offset;
                            let instruction = maneuver.instruction;

                            // Dịch hướng dẫn nếu không phải tiếng Việt
                            if (!instruction.includes("Rẽ") && !instruction.includes("Tiếp tục")) {
                                instruction = translateInstruction(instruction);
                            }

                            const coordIndex = offset * 3;
                            const lat = polylineCoords[coordIndex];
                            const lng = polylineCoords[coordIndex + 1];

                            instructionsHTML += `<li style="margin-bottom: 5px;">${maneuverIndex + 1}. ${instruction}</li>`;

                            if (typeof lat === 'number' && typeof lng === 'number') {
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
                                maneuverDot.addEventListener('tap', function(evt) {
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
                            }
                        });
                        instructionsHTML += `</ul>`;

                        // Tính toán khoảng cách và thời gian di chuyển
                        const distance = (routeData.sections[0].summary.length / 1000).toFixed(2);
                        const travelTimeSec = routeData.sections[0].summary.duration;
                        const travelTimeMin = Math.floor(travelTimeSec / 60);
                        const travelTimeSecRemaining = Math.floor(travelTimeSec % 60);

                        // Chuẩn bị dữ liệu để gửi về server
                        routesToSend.push({
                            date: currentTime.toISOString().split('T')[0],
                            time: formattedTime,
                            startPoint: startPointAddress,
                            endPoint: endPointAddress,
                            distance: distance,
                            travelTime: travelTimeMin * 60 + travelTimeSecRemaining
                        });

                        // Hiển thị thông tin tuyến đường trên giao diện
                        const routeSummary = `
                            <div style="color: ${colors[index]};">
                                <p>
                                    🔹 <strong>Tuyến đường ${index + 1}:</strong> 
                                    ${distance} km - ${travelTimeMin} phút ${travelTimeSecRemaining} giây
                                </p>
                                <details>
                                    <summary>Hướng dẫn chi tiết</summary>
                                    ${instructionsHTML}
                                </details>
                            </div>
                        `;
                        document.getElementById("routeDetailsContent").innerHTML += routeSummary;
                    }
                });

                // Gửi dữ liệu tuyến đường đến server
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
                    }
                }
            } else {
                alert("Không thể tìm đường đi!");
            }
        },
        (error) => {
            // Xử lý lỗi từ API định tuyến
            console.error("Lỗi tính đường đi:", error);
            if (error.message.includes("Rate limit")) {
                alert("Đã vượt quá giới hạn yêu cầu API. Vui lòng thử lại sau hoặc kiểm tra gói dịch vụ HERE Maps!");
            } else {
                alert("Đã xảy ra lỗi khi tính đường đi!");
            }
        }
    );
}

// Hàm tính toán đường đi từ input người dùng
function calculateDistance() {
    const startPointAddress = document.getElementById('startPoint').value;
    const endPointAddress = document.getElementById('endPoint').value;
    calculateAndDrawRoute(startCoords, endCoords, startPointAddress, endPointAddress);
}

// Hàm tạo tuyến đường ngẫu nhiên và lưu vào cơ sở dữ liệu
async function generateRandomRoute() {
    try {
        const points = await getRandomPoints();
        startCoords = points.start.coords;
        endCoords = points.end.coords;

        document.getElementById('startPoint').value = points.start.address;
        document.getElementById('endPoint').value = points.end.address;

        calculateAndDrawRoute(startCoords, endCoords, points.start.address, points.end.address);
    } catch (error) {
        console.error("Lỗi khi tạo tuyến đường ngẫu nhiên:", error);
        alert("Đã xảy ra lỗi khi tạo tuyến đường ngẫu nhiên!");
    }
}

// Lấy vị trí hiện tại
function getCurrentLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                let lat = position.coords.latitude;
                let lng = position.coords.longitude;
                let currentCoords = { lat: lat, lng: lng };

                let currentMarker = new H.map.Marker(currentCoords);
                map.addObject(currentMarker);
                map.setCenter(currentCoords);
                map.setZoom(14);

                reverseGeocode(lat, lng, function(address) {
                    document.getElementById('startPoint').value = address;
                });

                startCoords = [lat, lng];
                startMarker = currentMarker;
            },
            function(error) {
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
    setInterval(updateCurrentTime, 1000);

    document.getElementById('findRouteBtn').addEventListener('click', calculateDistance);
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
    document.getElementById('startPoint').addEventListener('keypress', e => {
        if (e.key === 'Enter') findCoords('start');
    });
    document.getElementById('endPoint').addEventListener('keypress', e => {
        if (e.key === 'Enter') findCoords('end');
    });
    document.getElementById('randomRouteBtn').addEventListener('click', generateRandomRoute);
});




'-'

1.2

public class Main{
    String indentifier = "Main" + '-'  + "1.2";
}