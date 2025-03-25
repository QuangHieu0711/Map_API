// Khởi tạo bản đồ Here Maps
const platform = new H.service.Platform({
    apikey: 'obtUNXXVNEw-lseLFfxlrirLW8Z8Zn578K8fTYSJnXQ' // Thay thế bằng API Key của bạn
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

// Hàm chuyển đổi tọa độ thành địa chỉ
function reverseGeocode(lat, lng, callback) {
    fetch(`https://revgeocode.search.hereapi.com/v1/revgeocode?at=${lat},${lng}&apikey=obtUNXXVNEw-lseLFfxlrirLW8Z8Zn578K8fTYSJnXQ`)
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
function calculateDistance() {
    if (!startCoords || !endCoords) {
        alert("Vui lòng chọn cả điểm đi và điểm đến!");
        return;
    }

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
        }
    }, error => {
        console.error("Lỗi tính đường đi:", error);
        alert("Đã xảy ra lỗi khi tính đường đi!");
    });
}

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
            }
        );
    } else {
        alert("Trình duyệt của bạn không hỗ trợ Geolocation!");
    }
}