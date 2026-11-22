"""Record local desktop primitives without external hosting or security overrides."""
import ctypes
import ctypes.util
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
from datetime import datetime, timezone

probe=Path(os.environ.get('PF_SEAT_TOOLS', tempfile.gettempdir())).resolve()
# Optional staged X server and package are developer test inputs.
# Record availability of host tools even when that cache is absent.
out=Path('evidence/rc12/browser/results')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest() if Path(p).is_file() else None
def run(args):
 try:
  p=subprocess.run(args,text=True,capture_output=True,timeout=8)
  return {'tool':Path(args[0]).name,'exitCode':p.returncode,'output':(p.stdout+p.stderr)[-2400:].replace(str(probe),'<temporary>')}
 except OSError as e:
  return {'tool':Path(args[0]).name,'outcome':'unavailable','errno':e.errno}
 except subprocess.TimeoutExpired:
  return {'tool':Path(args[0]).name,'outcome':'launched with no exit before the 8-second capability probe'}
def mark():return json.loads(subprocess.check_output(['node','scripts/fingerprint.mjs'],text=True))
identity=mark()
xvfb=probe/'debian-seat/usr/bin/Xvfb'
xorg=Path('/usr/lib/xorg/Xorg')
pkg=next(probe.glob('xvfb_*.deb'), None)
out.mkdir(parents=True,exist_ok=True)
r={'status':'BLOCKED','runUTC':datetime.now(timezone.utc).isoformat(),'sourceAndDistBefore':identity,
   'package':({'name':pkg.name,'bytes':pkg.stat().st_size,'sha256':sha(pkg)} if pkg else None),
   'seatEnvironment':{'DISPLAY':os.environ.get('DISPLAY'),'WAYLAND_DISPLAY':os.environ.get('WAYLAND_DISPLAY'),
      'DBUS_SESSION_BUS_ADDRESS':os.environ.get('DBUS_SESSION_BUS_ADDRESS'),'orcaAvailable':bool(shutil.which('orca')),
      'speechDispatcherAvailable':bool(shutil.which('speech-dispatcher')),
      'availability':{s:bool(shutil.which(s)) for s in ['Xvfb','Xorg','Xwayland','weston','orca','dbus-run-session']},
      'cachedPackages':{p:bool(list(probe.glob(p+'_*.deb'))) for p in ['xvfb','xwayland','weston','orca','speech-dispatcher']}},
   'xorg':run([xorg,':78','-noreset','-logfile',str(probe/'Xorg-run.log')]),
   'xvfb':run([xvfb,':79','-screen','0','1200x850x24','-nolisten','tcp']),
   'dbus':run(['/usr/bin/dbus-run-session','--','/usr/bin/true']),
   'atSpiLauncher':run(['/usr/libexec/at-spi-bus-launcher','--launch-immediately']),
   'seatBinarySha256':{p.name:sha(p) for p in [xorg,xvfb,Path('/usr/libexec/at-spi-bus-launcher')]}}

with tempfile.TemporaryDirectory() as td:
 try:
  with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as s:
   s.bind(str(Path(td)/'native-seat'));s.listen(1);r['localIpc']={'status':'listening'}
 except OSError as e:r['localIpc']={'status':'unavailable','errno':e.errno,'description':e.strerror}
 os.environ['XDG_RUNTIME_DIR']=td
 library=ctypes.util.find_library('wayland-server')
 lib=ctypes.CDLL(library,use_errno=True) if library else None
 if lib is None: r['wayland']={'available':False}
 else:
  lib.wl_display_create.restype=ctypes.c_void_p;lib.wl_display_add_socket.argtypes=[ctypes.c_void_p,ctypes.c_char_p]
  lib.wl_display_destroy.argtypes=[ctypes.c_void_p];lib.wl_display_destroy.restype=None
  d=lib.wl_display_create()
  if d:
   ctypes.set_errno(0);result=lib.wl_display_add_socket(d,b'qa-seat');r['wayland']={'displayObjectAllocated':True,'addSocketResult':result,'errnoAfterCall':ctypes.get_errno()};lib.wl_display_destroy(d)
  else:r['wayland']={'displayObjectAllocated':False,'errnoAfterCall':ctypes.get_errno()}
r['sourceAndDistAfter']=mark()
r['qualification']={'nativeSavedPdf':False,'nativeCancelAndReadback':False,'nativeZoomOnPublishedCandidate':False,'screenReaderSpeechOnPublishedCandidate':False}
r['interpretation']='Capability probe only. See actual process exit codes, socket results and target-tool availability. Native Save/Cancel/Retry on the target device and an actual screen-reader session require separate artifacts.'
(out/'local-desktop-capabilities.json').write_text(json.dumps(r,indent=2)+'\n')
assert identity==r['sourceAndDistAfter']
print(json.dumps({k:r[k] for k in ('status','localIpc','wayland','qualification')}))
