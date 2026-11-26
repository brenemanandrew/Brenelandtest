# VITURE head tracking for Brenai, for glasses the browser cannot read itself (the Luma Ultra, which VITURE's SDK calls "Carina").
#
# What it does: loads VITURE's own SDK library (glasses.dll and the files next to it), starts the glasses, reads the head pose about
# 120 times a second and sends it to the game page over a WebSocket on ws://127.0.0.1:8766, as {"yaw", "pitch", "roll"} in degrees
# (and the position in metres when tracking in 6DOF). The page already listens there while 3D glasses mode is on.
#
# Needs: Windows, Python 3.9 or newer (no extra packages), and the VITURE SDK's Windows library folder (the one holding glasses.dll,
# carina_vio.dll, libusb-1.0.dll, opencv_world4100.dll). Put this file in that folder, or pass the folder with --sdk.
#
#   python viture-bridge.py                 3DOF (turning your head)
#   python viture-bridge.py --6dof          6DOF (also leaning and moving; uses the glasses' cameras)
#   python viture-bridge.py --sdk "C:\path\to\sdk\lib" --pid 0x1102
#
# Stop it with Ctrl+C. Nothing is sent anywhere except to pages on this computer.

import argparse, base64, ctypes, hashlib, json, math, os, socket, struct, subprocess, sys, threading, time

PORT = 8766
ap = argparse.ArgumentParser()
ap.add_argument('--sdk', default=os.path.dirname(os.path.abspath(__file__)), help='folder holding glasses.dll')
ap.add_argument('--pid', default='', help='USB product id of the glasses, e.g. 0x1102 (found by itself if left out)')
ap.add_argument('--6dof', dest='six', action='store_true', help='track position as well as turning (Luma Ultra)')
ap.add_argument('--fake', action='store_true', help='no glasses: send a slow made-up head turn, to test the link to the page')
args = ap.parse_args()

# ---- the SDK ----
latest = {'yaw': 0.0, 'pitch': 0.0, 'roll': 0.0, 't': 0}
lock = threading.Lock()
K = 180 / math.pi
running = True
h = None

def put_quat(w, x, y, z, pos=None, status=0):
    # the same sums the page uses for the Pro 2: x to the right, y up, z toward the wearer (OpenGL), so turning left is +y
    pitch = math.asin(max(-1.0, min(1.0, 2 * (w * x - y * z)))) * K
    yaw = math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y)) * K
    roll = math.atan2(2 * (x * y + w * z), 1 - 2 * (x * x + z * z)) * K
    with lock:
        latest.update(yaw=yaw, pitch=pitch, roll=roll, t=time.time(), status=status)
        if pos is not None: latest['pos'] = pos

CLEAN = []
def start_glasses():
  global h
  sdk = os.path.abspath(args.sdk)
  if not os.path.exists(os.path.join(sdk, 'glasses.dll')):
      sys.exit(f'glasses.dll is not in {sdk}. Put this file in the SDK folder that has glasses.dll, or use --sdk "folder".')
  if hasattr(os, 'add_dll_directory'): os.add_dll_directory(sdk)
  os.environ['PATH'] = sdk + os.pathsep + os.environ.get('PATH', '')
  lib = ctypes.CDLL(os.path.join(sdk, 'glasses.dll'))
  H = ctypes.c_void_p
  def fn(name, res, *argt):
      f = getattr(lib, name); f.restype = res; f.argtypes = list(argt); return f
  create = fn('xr_device_provider_create', H, ctypes.c_int)
  valid = fn('xr_device_provider_is_product_id_valid', ctypes.c_int, ctypes.c_int)
  dtype = fn('xr_device_provider_get_device_type', ctypes.c_int, H)
  initialize = fn('xr_device_provider_initialize', ctypes.c_int, H, ctypes.c_char_p, ctypes.c_char_p)
  start = fn('xr_device_provider_start', ctypes.c_int, H)
  stop = fn('xr_device_provider_stop', ctypes.c_int, H)
  shutdown = fn('xr_device_provider_shutdown', ctypes.c_int, H)
  destroy = fn('xr_device_provider_destroy', None, H)
  CLEAN.append(lambda: (stop(h), shutdown(h), destroy(h)))
  market = fn('xr_device_provider_get_market_name', ctypes.c_int, ctypes.c_int, ctypes.c_char_p, ctypes.POINTER(ctypes.c_int))
  set_dof = fn('xr_device_provider_set_dof_type_carina', ctypes.c_int, H, ctypes.c_int)
  gl_pose = fn('xr_device_provider_get_gl_pose_carina', ctypes.c_int, H, ctypes.POINTER(ctypes.c_float), ctypes.c_double, ctypes.POINTER(ctypes.c_int))
  # older and other VITURE glasses (Gen1/Gen2) report through a callback instead
  POSE_CB = ctypes.CFUNCTYPE(None, ctypes.POINTER(ctypes.c_float), ctypes.c_uint64)
  reg_pose = fn('xr_device_provider_register_imu_pose_callback', ctypes.c_int, H, POSE_CB)
  open_imu = fn('xr_device_provider_open_imu', ctypes.c_int, H, ctypes.c_uint8, ctypes.c_uint8)

  def find_pids():
      """VITURE USB devices that are plugged in (VID 35CA), from Windows' own device list."""
      try:
          out = subprocess.run(['powershell', '-NoProfile', '-Command',
                                "Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match 'VID_35CA' } | ForEach-Object { $_.InstanceId }"],
                               capture_output=True, text=True, timeout=20).stdout
      except Exception:
          out = ''
      pids = []
      for line in out.upper().splitlines():
          i = line.find('PID_')
          if i >= 0:
              try:
                  p = int(line[i + 4:i + 8], 16)
                  if p not in pids: pids.append(p)
              except ValueError:
                  pass
      return pids

  pids = [int(args.pid, 0)] if args.pid else find_pids()
  pids = [p for p in pids if valid(p)] or pids
  if not pids: sys.exit('No VITURE glasses found. Plug them in (and close VITURE\'s own apps), then try again, or give --pid.')
  pid = pids[0]
  h = create(pid)
  if not h: sys.exit(f'The SDK could not open the glasses (product id 0x{pid:04X}).')
  name = ctypes.create_string_buffer(128); n = ctypes.c_int(128); market(pid, name, ctypes.byref(n))
  kind = dtype(h)
  print(f'Glasses: VITURE {name.value.decode(errors="ignore") or "?"}  (product 0x{pid:04X}, type {kind}: 0 Gen1, 1 Gen2, 2 Carina/Luma Ultra)')

  if kind == 2:
      set_dof(h, 1 if args.six else 0)
      rc = initialize(h, None, None)
      if rc != 0: sys.exit(f'The glasses would not start (initialize returned {rc}). Is VITURE\'s own app holding them? Close it and try again.')
      rc = start(h)
      if rc != 0: sys.exit(f'The glasses would not start (start returned {rc}).')
      print('Tracking in', '6DOF' if args.six else '3DOF', '(keep your head still for a second while it settles)')
      def poll():
          pose = (ctypes.c_float * 7)(); st = ctypes.c_int(1)
          while running:
              if gl_pose(h, pose, 0.0, ctypes.byref(st)) == 0:
                  put_quat(pose[3], pose[4], pose[5], pose[6], [pose[0], pose[1], pose[2]] if args.six else None, st.value)
              time.sleep(1 / 120)
      threading.Thread(target=poll, daemon=True).start()
  else:
      sys.exit('These glasses are read by the game page directly (no helper needed): use the head-tracking button in 3D mode.')

if args.fake:
    def fake():
        t0 = time.time()
        while running:
            t = time.time() - t0; a = math.radians(30 * math.sin(t)) * (0 if args.six else 1); put_quat(math.cos(a / 2), 0.0, math.sin(a / 2), 0.0, [0.4 * math.sin(t * 0.7), 0.0, 0.0] if args.six else None); time.sleep(1 / 120)   # 6DOF: sways side to side instead of turning
    threading.Thread(target=fake, daemon=True).start(); print('Fake head turn (no glasses)')
else:
    start_glasses()

# ---- a tiny WebSocket server (text frames out only), standard library ----
clients = []
def handshake(c):
    req = b''
    while b'\r\n\r\n' not in req:
        chunk = c.recv(4096)
        if not chunk: return False
        req += chunk
    key = ''
    for line in req.decode(errors='ignore').split('\r\n'):
        if line.lower().startswith('sec-websocket-key:'): key = line.split(':', 1)[1].strip()
    if not key: return False
    acc = base64.b64encode(hashlib.sha1((key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
    c.sendall(('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n').encode())
    return True
def frame(text):
    b = text.encode(); n = len(b)
    hdr = bytes([0x81, n]) if n < 126 else bytes([0x81, 126]) + struct.pack('>H', n)
    return hdr + b
def serve():
    s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind(('127.0.0.1', PORT)); s.listen(4)
    print(f'Waiting for the game page on ws://127.0.0.1:{PORT} (turn on 3D glasses mode in the game)')
    while running:
        c, _ = s.accept()
        try:
            if handshake(c):
                c.settimeout(2); clients.append(c); print('Game page connected')
            else: c.close()
        except Exception:
            c.close()
threading.Thread(target=serve, daemon=True).start()

try:
    last_print = 0
    while True:
        with lock: msg = json.dumps({k: (round(v, 3) if isinstance(v, float) else v) for k, v in latest.items() if k != 't'})
        for c in clients[:]:
            try: c.sendall(frame(msg))
            except Exception:
                clients.remove(c); print('Game page left')
        if time.time() - last_print > 2 and latest['t']:
            last_print = time.time()
            print(f"\ryaw {latest['yaw']:7.1f}  pitch {latest['pitch']:6.1f}  roll {latest['roll']:6.1f}  pages {len(clients)}   ", end='', flush=True)
        time.sleep(1 / 60)
except KeyboardInterrupt:
    pass
finally:
    running = False
    try:
        if h:
            for f in CLEAN: f()
    except Exception: pass
    print('\nStopped.')
