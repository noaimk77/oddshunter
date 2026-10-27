# GitHub Actions entry point for the Donaghy edit: runs the original sandbox pipeline
# (setup.sh -> bg.py -> comp.sh) and leaves the outputs in /tmp/www like the other folders.
import json, os, subprocess, sys
here = os.path.dirname(os.path.abspath(__file__))
r = subprocess.run(["bash", os.path.join(here, "setup.sh")])
credits = {"donaghy_2010": {"title": "File:Tim Donaghy in 2010.jpg", "artist": "Tim Donaghy", "license": "CC BY-SA 3.0"},
           "mugshot": {"title": "File:Mugshot of Tim Donaghy.jpg", "artist": "U.S. Department of Justice", "license": "Public domain"}}
json.dump({"credits": credits}, open("/tmp/www/credits.json", "w"))
for f in ("/tmp/www/comp.log", "/tmp/www/bg.log", "/tmp/www/status.txt"):
    if os.path.exists(f): print(f, open(f).read()[-1500:])
sys.exit(r.returncode)
