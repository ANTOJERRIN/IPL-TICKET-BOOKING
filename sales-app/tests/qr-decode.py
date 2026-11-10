"""Independent QR verification. Requires preprovisioned OpenCV/numpy and Node 22."""
import json, subprocess, uuid
import cv2
import numpy as np
refs=['00000000-0000-0000-0000-000000000000','ffffffff-ffff-ffff-ffff-ffffffffffff']+[str(uuid.uuid4()) for _ in range(10)]
script="import {ticketQr} from './src/lib/ticket-qr.ts'; const values="+json.dumps(refs)+"; console.log(JSON.stringify(values.map(ticketQr)));"
matrices=json.loads(subprocess.check_output(['node','--experimental-strip-types','--input-type=module','-e',script],text=True))
for reference,matrix in zip(refs,matrices):
    pixels=np.pad(np.array(matrix,dtype=np.uint8),4)
    image=cv2.resize((1-pixels)*255,None,fx=10,fy=10,interpolation=cv2.INTER_NEAREST)
    for rotation in range(4):
        actual,_,_=cv2.QRCodeDetector().detectAndDecode(np.rot90(image,rotation).copy())
        assert actual==reference,(reference,rotation,actual)
print('PASS independent QR decoder: 12 UUIDs, four orientations each')
