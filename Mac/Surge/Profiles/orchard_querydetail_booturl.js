let body = $response.body;

try {
    const obj = JSON.parse(body);
    const result = obj?.data?.result;
    const tag = "bootUrl 快抢快抢快抢快抢";
    const bootUrl = result?.itemSale?.bootUrl;

    if (bootUrl && typeof result?.itemName === "string") {
        if (!result.itemName.includes(tag)) {
            result.itemName = tag;
        }

        const copyUrl = "http://127.0.0.1:6171/copy?text=" + encodeURIComponent(bootUrl);

        $httpClient.get(copyUrl, function (error, response, data) {
            if (!error) {
                $notification.post("bootUrl 已复制", "", bootUrl);
            } else {
                $notification.post("复制失败", "", String(error));
            }
        });
    }

    $done({ body: JSON.stringify(obj) });
} catch (e) {
    $done({ body });
}