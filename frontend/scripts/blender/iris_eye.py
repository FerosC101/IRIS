"""IRIS logo sting in Blender: the mark is on screen from the start, its ring glances left and right like an iris, the eye
closes (both arrows pull in), then the screen
goes black. 6 s at 60 fps, 1920x1080, EEVEE with motion blur. Colours match the slides: mark #4DCCD1 on flat #202020.

The geometry comes from scripts/logo-geometry.mjs (measured from the logo PNG): the two strokes are rebuilt as smooth
curves with a constant width (so they draw on and close without thinning), the ring as an elliptical band, the arrowheads
as triangles.

Usage:
  Blender -b --python scripts/blender/iris_eye.py -- <geometry.json> <out_dir> [preview|full]
  preview renders a few stills to <out_dir>/preview_<frame>.png; full renders every frame to <out_dir>/frames/.
"""
import json
import math
import sys
from pathlib import Path

import bpy

argv = sys.argv[sys.argv.index("--") + 1:]
GEO = json.loads(Path(argv[0]).read_text())
OUT = Path(argv[1])
MODE = argv[2] if len(argv) > 2 else "full"
FPS, SECONDS = 60, 6
CLOSE0, CLOSE1, FADE0, FADE1 = 2.95, 4.15, 4.5, 5.7   # the blink and the fade to black (s)
MARK_HEX, BG_HEX = "#4DCCD1", "#202020"     # as on the slides
S = 100.0                                   # logo pixels per Blender unit
CX, CY = GEO["ring"]["cx"], GEO["ring"]["cy"]


def P(x, y, z=0.0):
    """Logo pixel (y down) to scene units, centred on the ring."""
    return ((x - CX) / S, -(y - CY) / S, z)


def F(t):
    """Seconds to frame number."""
    return round(t * FPS) + 1


def lin(hex_):
    c = [int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c] + [1.0]


def key(obj, path, frames_values, index=-1):
    for t, v in frames_values:
        if index >= 0:
            getattr(obj, path)[index] = v
        else:
            setattr(obj, path, v)
        obj.keyframe_insert(path, index=index, frame=F(t))


# ---- Scene.
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
sc.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in engines else "BLENDER_EEVEE_NEXT"
sc.render.resolution_x, sc.render.resolution_y, sc.render.fps = 1920, 1080, FPS
sc.frame_start, sc.frame_end = 1, FPS * SECONDS
sc.view_settings.view_transform = "Standard"
sc.render.use_motion_blur = True
sc.render.motion_blur_shutter = 0.5
sc.eevee.taa_render_samples = 48

cam = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
cam.data.type = "ORTHO"
cam.data.ortho_scale = 11.4
cam.location = (0, 0.05, 10)
sc.collection.objects.link(cam)
sc.camera = cam


def emission_mat(name, hex_, alpha_node=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = lin(hex_)
    em.inputs["Strength"].default_value = 1.0
    if not alpha_node:
        nt.links.new(em.outputs[0], out.inputs["Surface"])
        return m, nt, em, None
    mix = nt.nodes.new("ShaderNodeMixShader")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    return m, nt, em, mix


MARK = MARK_HEX
mark_mat, *_ = emission_mat("Mark", MARK)


def mesh_obj(name, verts, faces, mat, z=0.0, origin=(0.0, 0.0)):
    me = bpy.data.meshes.new(name)
    me.from_pydata([(x - origin[0], y - origin[1], z) for x, y, *_ in verts], [], faces)
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    ob.location = (origin[0], origin[1], 0)
    sc.collection.objects.link(ob)
    return ob


# ---- Background: flat, the slides' dark grey.
bg_mat = bpy.data.materials.new("Background")
bg_mat.use_nodes = True
nt = bg_mat.node_tree
nt.nodes.clear()
em, out = nt.nodes.new("ShaderNodeEmission"), nt.nodes.new("ShaderNodeOutputMaterial")
em.inputs["Color"].default_value = lin(BG_HEX)
nt.links.new(em.outputs[0], out.inputs["Surface"])
mesh_obj("Background", [(-12, -7), (12, -7), (12, 7), (-12, 7)], [(0, 1, 2, 3)], bg_mat, z=-2)

# ---- Ring: an elliptical band, drawn from the top down both sides by an angle mask.
R = GEO["ring"]
ring_mat, rnt, _, rmix = emission_mat("Ring", MARK, alpha_node=True)
tc, sep, atan, absn, cmp, half = (rnt.nodes.new(t) for t in ("ShaderNodeTexCoord", "ShaderNodeSeparateXYZ", "ShaderNodeMath",
                                                           "ShaderNodeMath", "ShaderNodeMath", "ShaderNodeValue"))
atan.operation, absn.operation, cmp.operation = "ARCTAN2", "ABSOLUTE", "LESS_THAN"
rnt.links.new(tc.outputs["Object"], sep.inputs[0])
rnt.links.new(sep.outputs["X"], atan.inputs[0])            # angle measured from the top
rnt.links.new(sep.outputs["Y"], atan.inputs[1])
rnt.links.new(atan.outputs[0], absn.inputs[0])
rnt.links.new(absn.outputs[0], cmp.inputs[0])
rnt.links.new(half.outputs[0], cmp.inputs[1])
rnt.links.new(cmp.outputs[0], rmix.inputs["Fac"])
SEG = 160
verts = []
for rx, ry in ((R["rx"], R["ry"]), (R["irx"], R["iry"])):
    for i in range(SEG):
        a = 2 * math.pi * i / SEG
        verts.append(((math.sin(a) * rx) / S, (math.cos(a) * ry) / S))
faces = [(i, (i + 1) % SEG, SEG + (i + 1) % SEG, SEG + i) for i in range(SEG)]
eye = bpy.data.objects.new("Eye", None)                  # the ring, squeezed shut on the blink
sc.collection.objects.link(eye)
ring = mesh_obj("Ring", verts, faces, ring_mat)
ring.parent = eye
half.outputs[0].default_value = math.pi + 0.05   # the ring is whole from the start

# ---- The ring is the iris: it glances left, then right, then back.
g = 0.3 * R["rx"] / S
key(ring, "location", [(1.0, 0), (1.35, -g), (1.6, -g), (2.1, g), (2.35, g), (2.7, 0)], index=0)

# ---- Lids: smooth curves of constant width. When the eye closes they meet on one curve and their arrow ends pull in.
K, BUMP, SIG = 0.02, 0.2, 1.1                          # closed shape: flattened toward the centre, bowed slightly down


def closed(x, y):
    return K * y - BUMP * math.exp(-(x / SIG) ** 2)


def lid(name, st, keep_x):
    pts = [P(x, y, 0.2) for x, y in st["points"]]
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = st["width"] / 2 / S
    cu.bevel_resolution = 6
    cu.use_fill_caps = True
    cu.resolution_u = 8
    cu.bevel_factor_mapping_end = "SPLINE"
    sp = cu.splines.new("NURBS")
    sp.points.add(len(pts) - 1)
    for p, (x, y, z) in zip(sp.points, pts):
        p.co = (x, y, z, 1)
    sp.order_u, sp.use_endpoint_u = 4, True
    cu.materials.append(mark_mat)
    ob = bpy.data.objects.new(name, cu)
    sc.collection.objects.link(ob)
    ob.shape_key_add(name="Basis", from_mix=False)
    shut = ob.shape_key_add(name="Closed", from_mix=False)
    for d, (x, y, z) in zip(shut.data, pts):
        d.co = (x, closed(x, y), z)
    # How much of the stroke is left once the arrow end has pulled in to keep_x (logo px), as a share of its length.
    xs = [x for x, *_ in pts]
    seg = [math.dist(pts[i][:2], pts[i + 1][:2]) for i in range(len(pts) - 1)]
    kx = (keep_x - CX) / S
    i_keep = next(i for i, x in enumerate(xs) if (x >= kx if xs[-1] > xs[0] else x <= kx))
    keep = sum(seg[:i_keep]) / sum(seg)
    key(cu, "bevel_factor_end", [(CLOSE0, 1.0), (CLOSE1, keep)])
    key(shut, "value", [(CLOSE0, 0.0), (CLOSE1, 1.0)])
    ex, ey, _ = pts[i_keep]
    # Arrowhead: a triangle at the end of the stroke that pops out as the stroke arrives, and follows the lid when it closes.
    a = st["arrow"]
    bx, by, _ = P(*a["base"])
    tx, _, _ = P(*a["tip"])
    h = a["half"] / S
    back = 0.18 * (tx - bx)                              # slight notch in the back edge, like the logo's arrows
    arrow = mesh_obj(name + "Arrow", [(bx - back * 0.4, by + h), (tx, by), (bx - back * 0.4, by - h), (bx + back, by)],
                     [(0, 3, 1), (3, 2, 1)], mark_mat, z=0.2, origin=(bx, by))
    # The arrowhead rides in with the end of the stroke and shrinks away.
    key(arrow, "scale", [(CLOSE0, (1, 1, 1)), (CLOSE1 - 0.15, (0, 0, 1))])
    key(arrow, "location", [(CLOSE0, bx), (CLOSE1 - 0.15, ex)], index=0)
    key(arrow, "location", [(CLOSE0, by), (CLOSE1 - 0.15, closed(ex, ey))], index=1)
    return ob


lid("Top", GEO["top"], CX + 1.9 * R["rx"])
lid("Bottom", GEO["bottom"], CX - 1.9 * R["rx"])

# ---- Closing: the ring squeezes shut behind the lids.
key(eye, "scale", [(CLOSE0, (1, 1, 1)), (CLOSE1 - 0.1, (1.03, 0.0, 1))])

# ---- Fade to black.
black_mat, _, _, bmix = emission_mat("Black", "#000000", alpha_node=True)
mesh_obj("BlackOut", [(-12, -7), (12, -7), (12, 7), (-12, 7)], [(0, 1, 2, 3)], black_mat, z=1.5)
key(bmix.inputs["Fac"], "default_value", [(FADE0, 0.0), (FADE1, 1.0)])

# ---- Render.
OUT.mkdir(parents=True, exist_ok=True)
sc.render.image_settings.file_format = "PNG"
if MODE == "preview":
    for t in (0.0, 1.45, 2.2, 3.3, 3.7, 4.3, 5.1, 5.9):
        sc.frame_set(F(t))
        sc.render.filepath = str(OUT / f"preview_{F(t):03d}.png")
        bpy.ops.render.render(write_still=True)
else:
    (OUT / "frames").mkdir(exist_ok=True)
    sc.render.filepath = str(OUT / "frames" / "f_")
    bpy.ops.render.render(animation=True)
print("done", MODE)
