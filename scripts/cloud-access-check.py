from urllib.request import urlopen, Request
from urllib.error import HTTPError
from pathlib import Path
import json, re
config = (Path(__file__).resolve().parent.parent / 'dist/cloud-config.js').read_text(encoding='utf-8')
url = re.search(r"url: '([^']+)'", config).group(1)
key = re.search(r"publishableKey: '([^']+)'", config).group(1)
def request(route, body=None):
    headers = {'apikey': key}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    req = Request(url + route, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    try:
        with urlopen(req, timeout=25) as response:
            return response.status, response.read().decode()
    except HTTPError as error:
        return error.code, error.read().decode()
status, body = request('/rest/v1/album_photos?select=id')
assert status >= 400 or json.loads(body) == [], 'Anonymous photos exposed'
status, _ = request('/rest/v1/rpc/current_album_role', {})
assert status >= 400, 'Anonymous role RPC exposed'
status, _ = request('/functions/v1/album-enroll', {'action':'inspect', 'token':'invalid'})
assert status == 400, 'Invalid invitation accepted'
status, _ = request('/storage/v1/object/public/our-universe-private/our-universe/example.jpg')
assert status != 200, 'Public storage URL accepted'
print('PASS: anonymous album read, role RPC, invalid enrollment and public photo URL are denied.')
