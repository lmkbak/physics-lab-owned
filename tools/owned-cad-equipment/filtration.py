"""New independent vacuum filtration apparatus; no referenced mesh/CAD input."""
import cadquery as cq
from families import cyl,cone,cup,tube,V,fuse
from glassware import line_tube

def c33(s):
 d=s['dimensions'];ro=d['bottleBaseRadius'];ri=ro-d['wall']
 outer=fuse([cyl(ro,8),cone(ro,14,95,8),cyl(14,42,103),line_tube((12,0,118),(48,0,118),5,3)])
 inner=fuse([cyl(ri,5,3),cone(ri,12,95,8),cyl(12,44,103),cq.Solid.makeCylinder(3,38,V(11,0,118),V(1,0,0))])
 bottle=outer.cut(inner)
 seat=cone(11.7,15,22).cut(cone(5.6,7.2,22))
 # One ceramic body: open top cup, perforated plate and hollow lower delivery neck.
 funnel=cup(33,30.8,42,3).fuse(tube(6.8,4.8,40,-40))
 funnel=funnel.cut(cyl(4.8,46,-41))
 for x,y in d['holes']:funnel=funnel.cut(cyl(d['holeRadius'],5,-1,x,y))
 paper=cyl(29.5,.25)
 return [('bottle',bottle,'glass',[0,0,0]),('seat',seat,'rubber',[0,0,146]),('funnel',funnel,'ceramic',[0,0,190]),('paper',paper,'paper',[80,0,0])]
BUILDERS={'C33':c33}
