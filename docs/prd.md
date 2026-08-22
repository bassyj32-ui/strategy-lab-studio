# Strategy Lab Studio — PRD

STRATEGY LAB INTERNAL STUDIO
Master Product Requirements Document — v1.0
Product: Strategy Lab Internal Studio
 Type: Private battle-animation production studio
 Primary user: Strategy Lab creator
 Primary purpose: Create professional, highly controllable historical battle-animation footage for final editing in CapCut/DaVinci Resolve.
The single most important principle
Do NOT build an AI video generator. Build a deterministic, commander-controlled battlefield animation studio.
The creator controls the battlefield.
AI accelerates commands.
The scene engine stores the decisions.
Remotion renders them.
FFmpeg encodes them.
CapCut/DaVinci turns the rendered footage into the final film.

1. PRODUCT VISION
Strategy Lab Internal Studio is a specialized 2D/2.5D tactical animation environment for reconstructing historical battles.
The creator imports a beautiful clean battlefield map and independently builds the battle on top of it.
The creator must be able to control:
armies
formations
individual units
infantry
cavalry
archers
elephants
commanders
banners
tactical arrows
movement paths
attacks
retreats
charges
formations
highlights
labels
effects
camera
zoom
rotation
timing
scale
opacity
depth
scene composition
rendering/export
Nothing important should be permanently baked into an uncontrollable video.

2. PRODUCT PHILOSOPHY
The Golden Rule
AI creates possibilities.
The creator makes decisions.
The scene engine executes those decisions.
The renderer renders those decisions.
Therefore:
AI
 ↓
Suggestion / Command
 ↓
Structured Scene Operations
 ↓
Scene Engine
 ↓
Editable Battlefield
 ↓
Creator Refinement
 ↓
Remotion
 ↓
FFmpeg
 ↓
Production Footage
 ↓
CapCut / DaVinci
 ↓
Final Video


3. WHAT THIS PRODUCT IS NOT
The application is not:
an AI video generator
an automatic YouTube generator
an autonomous battle simulator
a replacement for CapCut
a replacement for DaVinci Resolve
a full 3D game engine
a generic SaaS video editor
a public marketplace
a commercial asset platform
There will be:
❌ No Stripe
❌ No subscriptions
❌ No billing
❌ No public onboarding
❌ No multi-tenant architecture
❌ No customer dashboard
❌ No public API marketplace
❌ No licensing-management system
This is:
Strategy Lab Internal Studio
A private production tool.

4. FINAL PRODUCTION WORKFLOW
HISTORICAL RESEARCH
        ↓
BATTLE SCRIPT
        ↓
CLEAN MAP
        ↓
ASSETS
        ↓
STRATEGY LAB INTERNAL STUDIO
        ↓
IMPORT MAP
        ↓
PLACE ARMIES
        ↓
CREATE FORMATIONS
        ↓
ANIMATE MOVEMENTS
        ↓
ANIMATE ARROWS / ATTACKS
        ↓
DIRECT CAMERA
        ↓
BUILD SCENES
        ↓
PREVIEW
        ↓
MANUALLY PERFECT
        ↓
DETERMINISTIC RENDER
        ↓
CAPCUT / DAVINCI
        ↓
NARRATION
MUSIC
SFX
TEXT
COLOR
PACING
        ↓
FINAL STRATEGY LAB VIDEO


5. MAP-FIRST ARCHITECTURE
The preferred workflow is:
Google Flow / Gemini / external map workflow
              ↓
Beautiful clean battlefield map
              ↓
HD cleanup
              ↓
Strategy Lab Internal Studio
              ↓
Add tactical elements

The map should preferably contain:
terrain
rivers
roads
hills
forests
settlements
bridges
coastlines
terrain shading
geographic landmarks
It should preferably not contain:
armies
unit symbols
tactical arrows
battle labels
commander portraits
pre-rendered battle movements
The map becomes the world.
Everything tactical becomes an independent layer.

6. CLEAN MAP = MAXIMUM FREEDOM
Architecture:
WORLD
 └── Battlefield Map

TACTICAL OBJECTS
 ├── Red Army
 │    ├── Infantry
 │    ├── Cavalry
 │    └── Archers
 │
 ├── Blue Army
 │    ├── Infantry
 │    └── Cavalry
 │
 ├── Commanders
 ├── Banners
 ├── Arrows
 ├── Highlights
 ├── Labels
 └── Effects

CAMERA
 └── Camera Track

This means:
Change the battle without changing the map.

7. ABSOLUTE COMMANDER MODE
The creator remains the absolute commander.
The AI cannot override this principle.
The creator must always be able to manually modify:
X
Y
position
rotation
scale
opacity
path
duration
start time
end time
easing
grouping
visibility
depth
camera
effects
AI-generated changes must remain editable.

8. EVERYTHING IMPORTANT IS AN OBJECT
Every tactical element gets its own identity.
Examples:
red_cavalry_01
hannibal_marker
roman_center
numidian_cavalry
flank_arrow_01
decisive_move_01

Objects include:
Map
Army
Division
Formation
Unit
Commander
Banner
Arrow
Movement Path
Highlight
Label
Marker
Effect
Camera
Each object must have a unique ID.

9. OBJECT MODEL
Conceptually:
{
  "id": "red_cavalry_01",
  "type": "cavalry",
  "team": "red",
  "position": {
    "x": 640,
    "y": 420
  },
  "scale": 1,
  "rotation": 15,
  "opacity": 1
}

The exact schema can evolve.
The architectural requirement cannot:
Objects must remain independently addressable and editable.

10. OBJECT LIBRARY
Initial object types:
Units
Infantry
Heavy Infantry
Light Infantry
Cavalry
Heavy Cavalry
Archer
Spearman
Elephant
Chariot
Naval Unit
Tactical
Commander
Commander Portrait
Army Banner
Flag
Formation Marker
City Marker
Fortification
Camp
Animation
Tactical Arrow
Curved Arrow
Charge Arrow
Retreat Arrow
Attack Arrow
Movement Trail
Highlight
Spotlight
Impact
Dust
Smoke
Fire
Projectile
Arrow Volley

11. HIERARCHICAL ARMIES
The user must not be forced to animate hundreds of individual objects.
Example:
Hannibal's Army
 ├── Center
 │    ├── African Infantry
 │    ├── Spanish Infantry
 │    └── Gallic Infantry
 │
 ├── Left Cavalry
 │    ├── Cavalry 01
 │    └── Cavalry 02
 │
 └── Right Cavalry
      ├── Cavalry 03
      └── Cavalry 04

Moving the group moves the children.
Individual children can still be overridden.

12. PARENT / CHILD TRANSFORMS
Support:
Army
 ↓
Wing
 ↓
Formation
 ↓
Unit

If the wing moves:
→ formation moves.
If formation moves:
→ units move.
If one unit needs a special movement:
→ override that unit.
This gives:
High-level control + granular control.

13. DIRECT MANIPULATION
The battlefield must behave like a design canvas.
Select object:
       ↻
        │
    [ UNIT ]
   ↙       ↘

User can:
drag
resize
rotate
duplicate
delete
group
Coordinates remain available for precision, but manual coordinate entry must never be required.

14. DRAG-AND-DROP
Core workflow:
Drag Cavalry
      ↓
Drop onto map
      ↓
Position
      ↓
Set start
      ↓
Set destination
      ↓
Animate

The basic workflow must feel immediately understandable.

15. MULTI-SELECTION
Allow selecting multiple objects.
Example:
Infantry 01
Infantry 02
Infantry 03
Infantry 04

Then:
move together
scale together
rotate together
duplicate
group

16. FORMATION SYSTEM
Initial formations:
Line
■ ■ ■ ■ ■ ■

Column
■
■
■
■

Wedge
  ■
  ■ ■
 ■ ■ ■

Square
■ ■ ■ ■
■ ■ ■ ■
■ ■ ■ ■

Custom
Creator manually arranges the formation.

17. TIMELINE
The timeline is the heart of the Studio.
Example:
TIME
0      2      4      6      8      10

MAP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RED ARMY
──────●────────────●────────

BLUE ARMY
────────●────────────●──────

CAVALRY
────────────●────●──────────

ARROW
──────────────●─────────────

CAMERA
●────────●──────────●───────


18. KEYFRAME SYSTEM
Core keyframe properties:
Position X
Position Y
Scale
Rotation
Opacity
Later:
Anchor
Blur
Brightness
Saturation
Shadow
Path progress
Mask
Depth
Perspective
Effects

19. MULTI-KEYFRAME ANIMATION
Objects must support:
A → B → C → D → E

Example:
0 sec   Start
3 sec   Advance
5 sec   Turn
7 sec   Charge
9 sec   Impact
12 sec  Retreat

Every stage remains editable.

20. BEZIER PATH SYSTEM
Movement cannot be restricted to straight lines.
Support:
straight paths
multi-point paths
curved paths
flanking
encirclement
retreat
pursuit
charge
split
merge
Example:
A
 \
  )
 )
B

The creator can drag path control points.

21. PATH EDITOR
When an object is selected:
Movement Path

●────────────●
      ╲
       ╲
        ●

Allow:
add points
delete points
drag points
curve paths
reverse paths
adjust duration
adjust easing
preview

22. EASING
Support:
Linear
Ease In
Ease Out
Ease In/Out
Cubic
Custom Bezier
Default easing should look natural.
The creator always retains control.

23. SPEED CONTROL
Control:
start time
end time
duration
path speed
Examples:
Long duration
→ marching.
Short duration
→ cavalry charge.

24. PLAYBACK
Before rendering:
Play
Pause
Scrub
Jump to time
Loop
Playback speed
The entire battlefield should animate interactively.

25. CAMERA SYSTEM
Camera is a first-class object.
Controls:
X
Y
Zoom
Rotation
Duration
Easing
Example:
0s   Wide battlefield

4s   Zoom left flank

7s   Pan center

10s  Follow cavalry

14s  Pull back


26. CAMERA KEYFRAMES
Example:
0s
Scale 1.0
Position A

5s
Scale 1.4
Position B

9s
Scale 1.8
Position C

13s
Scale 1.0
Position D

Camera movement must be editable just like any other animation.

27. CAMERA PRESETS
Include:
Battlefield Overview
Tactical Zoom
Flank Follow
Commander Focus
Decisive Moment
Presets must remain editable after application.

28. LAYER SYSTEM
Example:
SCENE 01

📷 Camera

🌍 Map

🌲 Terrain Effects

🔴 Red Army
   ├── Infantry
   ├── Cavalry
   └── Archers

🔵 Blue Army
   ├── Infantry
   └── Cavalry

➡ Tactical Arrows

🎯 Highlights

🏷 Labels

Layers can be:
hidden
locked
duplicated
renamed
reordered

29. LOCKING
The creator can lock:
map
terrain
completed formation
camera
labels
any object
Locked objects cannot accidentally move.

30. STRATEGY LAB VISUAL LANGUAGE
Branding is not merely the logo.
The visual system should create recognition through:
map treatment
red/blue army language
tactical arrows
unit design
shadows
typography
camera behavior
commander markers
highlights
Decisive Move
Why It Worked
The viewer should eventually recognize Strategy Lab before seeing the logo.

31. RED / BLUE SYSTEM
Default:
RED = Army A
BLUE = Army B
But custom colors must remain possible when historical accuracy requires them.

32. SIGNATURE ARROWS
Reusable arrow styles:
Attack
Flank
Retreat
Encirclement
Movement
Charge
Each style has consistent:
thickness
arrowhead
opacity
animation
easing

33. ARROW DRAW-ON
Arrow animation should be built in.
0% → 100%

Creator controls:
start
end
duration
thickness
opacity
color
easing

34. ARROW VOLLEY
Reusable volley system.
Example:
8–12 arrows
      ↓
A → B

Allow modification of:
quantity
spread
trajectory
duration
size
direction
stagger
Every arrow remains editable.

35. BANNERS
Banners remain independent.
Support:
move
rotate
scale
fade
follow formations
attach to groups
Optional subtle animation:
1.0 → 1.03 → 1.0


36. COMMANDER MARKERS
Support:
portrait
name
faction
marker
position
Example:
[PORTRAIT]
 HANNIBAL
    ↓
 🔴 Army

Can be toggled on/off.

37. HISTORICAL CONFIDENCE
Optional visual labels:
CONFIRMED
PROBABLE
DISPUTED
These must remain optional and visually restrained.

38. "DECISIVE MOVE"
A major Strategy Lab signature.
Native macro:
TRIGGER_DECISIVE_MOVE

Can create:
camera zoom
focal positioning
highlight
tactical arrow
appropriate easing
optional vignette
optional pulse
optional dramatic timing
Everything remains editable.

39. "WHY IT WORKED"
Another reusable visual preset.
The Studio prepares the battlefield visually.
CapCut/DaVinci handles:
narration
final text
music
SFX
pacing

40. SCENE SYSTEM
Long battles must be divided into scenes.
Example:
CANNAE

Scene 01 — Battlefield
Scene 02 — Roman Advance
Scene 03 — Hannibal's Flanks
Scene 04 — Double Envelopment
Scene 05 — Collapse
Scene 06 — Decisive Move

Each scene contains:
map
objects
groups
camera
timeline
effects
markers
duration
export settings

41. SCENE DUPLICATION
Allow:
Scene 04
   ↓
Duplicate
   ↓
Scene 05

Then modify the new scene without destroying the original.

42. BATTLE STATE
Scenes should preserve battle states.
Example:
Scene 1
Red north
Blue south

Scene 2
Red advances

Scene 3
Cavalry behind enemy

This makes long battle reconstruction practical.

43. NON-DESTRUCTIVE EDITING
Never modify original assets destructively.
For:
cavalry.svg

store:
Asset
+
Transform
+
Animation

The source remains untouched.

44. ASSET LIBRARY
Categories:
Infantry
Cavalry
Archers
Elephants
Commanders
Banners
Weapons
Arrows
Markers
Highlights
Effects
Terrain
Labels
Each asset contains metadata:
asset_id
name
category
faction
aspect_ratio
default_scale
default_shadow


45. TRANSPARENT ASSETS
Preferred:
PNG
SVG
WebP with alpha
transparent video where supported
This enables independent tactical overlays.

46. 2D / 2.5D ENGINE
The Studio should create subtle depth without requiring full 3D.
Support:
shadows
scale
depth ordering
slight perspective
elevation
parallax
camera movement
The map remains the visual foundation.

47. SHADOW SYSTEM
Units should support:
drop shadow
blur
offset
opacity
Purpose:
Make clean tactical assets feel naturally placed on the battlefield.
Avoid excessive cinematic effects.

48. DEPTH ORDER
Default conceptual order:
Map
 ↓
Terrain
 ↓
Units
 ↓
Effects
 ↓
Arrows
 ↓
Labels

Objects can have adjustable depth/z-order.

49. OPTIONAL PARALLAX
Later support:
Background
Terrain
Units
Effects

moving at slightly different rates to create subtle 2.5D depth.

50. EFFECT SYSTEM
Initial effects:
smoke
dust
impact
fire
glow
highlight
fade
blur
vignette
Effects are optional.
The guiding principle:
Tactical clarity before cinematic spectacle.

51. AI COMMANDER
AI Commander is an optional control layer.
Manual workflow:
Drag
 ↓
Keyframe
 ↓
Adjust
 ↓
Preview
 ↓
Render

AI workflow:
Describe maneuver
 ↓
AI generates structured commands
 ↓
Preview
 ↓
Apply / Reject
 ↓
Manual refinement
 ↓
Render

AI is an accelerator.
It is not the foundation.

52. NATURAL LANGUAGE COMMANDS
Examples:
"Move Hannibal's cavalry around the Roman right flank over six seconds."
"Advance the Carthaginian center slowly for four seconds."
"Have the Roman left retreat toward the river starting at 18 seconds."
"Fire one arrow volley from the selected archers toward the enemy center at 12 seconds."
"Make these six units a single infantry formation."
The AI converts these into editable scene operations.

53. AI OPERATES ON THE SCENE MODEL
Architecture:
Natural Language
      ↓
AI interpretation
      ↓
Structured commands
      ↓
Scene Engine
      ↓
Timeline / Paths / Keyframes

Example:
move_group(
  group="numidian_cavalry",
  path="generated_bezier",
  duration=6,
  easing="easeInOut"
)

The actual implementation can differ.
The principle cannot.

54. AI TOOL CALLING
Expose controlled functions such as:
create_unit()
duplicate_unit()
delete_unit()

create_group()
add_to_group()
remove_from_group()

move_unit()
move_group()

rotate_unit()
scale_unit()

create_path()
modify_path()

set_keyframe()
set_easing()
change_duration()

create_arrow()
create_arrow_volley()

create_camera_move()

create_highlight()

set_opacity()

change_timeline()

trigger_decisive_moment()

AI cannot directly access the renderer.

55. AI MUST NEVER GENERATE THE VIDEO
Never:
Prompt
 ↓
AI video
 ↓
Finished

Always:
Prompt
 ↓
Structured commands
 ↓
Scene model
 ↓
Editable battlefield
 ↓
Creator approval
 ↓
Remotion
 ↓
Render


56. VISUAL OBJECT SELECTION FOR AI
User can click an object.
Example:
🔵
 ↑
SELECTED

Then:
"Make this cavalry circle behind the Roman formation."
AI receives the selected object's identity.

57. HIGH-LEVEL TACTICAL COMMANDS
Support commands such as:
advance()
retreat()
flank()
encircle()
charge()
volley()
pursue()
split()
reform()

These are animation operations, not historical truth claims.
The creator remains responsible for historical interpretation.

58. TIMELINE-AWARE AI
AI must understand time.
Example:
"At 12 seconds advance the center. Three seconds later begin the cavalry flank. At 20 seconds fire the arrow volley."
The resulting operations must be placed at those timeline positions.

59. COMPLEX MANEUVER GENERATION
Example:
"Hannibal's center should gradually retreat, pulling the Roman infantry forward. Once the Romans advance deep enough, both cavalry wings should move around their flanks and close behind them."
AI may create:
00–06s  Center retreats
06–10s  Roman center advances
10–16s  Left cavalry flanks
10–16s  Right cavalry flanks
16–20s  Cavalry closes
20–22s  Encirclement holds

Creator previews and edits every operation.

60. AI TRANSACTIONS
A complex AI operation becomes one undoable transaction.
Example:
"Perform Hannibal's double envelopment."
May modify:
left cavalry
right cavalry
infantry
paths
arrows
camera
highlight
All become:
ONE AI transaction.
Undo restores the previous scene state.

61. AI CHANGE HISTORY
Example:
AI Change #17
Move Numidian cavalry around flank

AI Change #18
Slow movement by 2 seconds

AI Change #19
Move cavalry 40px north

Each remains reviewable/undoable.

62. AI CONTEXT OPTIMIZATION
AI must not receive hundreds of raw objects unnecessarily.
Instead it receives summarized scene state.
Example:
RED ARMY
- Center Infantry
- Left Cavalry
- Right Cavalry

BLUE ARMY
- Center Legion
- Right Cavalry

When AI requests:
"Move Left Cavalry."
The Scene Engine resolves the actual object IDs.
This protects context size and improves reliability.

63. AI ASSET MANAGEMENT
Eventually allow:
"Add six Numidian cavalry units."
"Add Hannibal's commander marker."
"Duplicate this cavalry formation."
"Replace these infantry with heavy Roman infantry."
AI should preferably instantiate approved existing Strategy Lab assets, not randomly create new visual assets.

64. AI PROVIDER ABSTRACTION
Do not hard-code the Studio around one model.
Architecture:
AIProvider
 ├── DeepSeek
 ├── OtherModel
 └── LocalModel

DeepSeek can be the initial provider.
If AI fails:
The Studio must continue working normally.
AI is optional.

65. SCENE STATE = SINGLE SOURCE OF TRUTH
The complete battlefield exists as structured data.
Conceptually:
Scene
 ├── objects[]
 ├── groups[]
 ├── keyframes[]
 ├── camera
 ├── timeline
 ├── effects[]
 └── metadata

This same scene state powers:
editor preview
AI Commander
save/load
Remotion rendering
This prevents the editor and renderer from drifting apart.

66. RENDERING PHILOSOPHY
HARD RULE
AI DOES NOT RENDER VIDEO.
The rendering engine is deterministic.
Preferred:
Remotion + FFmpeg

67. REMOTION ARCHITECTURE
Conceptually:
React
 ↓
Battle Scene
 ↓
Scene State
 ↓
Remotion Composition
 ↓
Frame Rendering
 ↓
FFmpeg
 ↓
Output

Same scene state + same settings should produce the same animation.

68. RENDERING SEPARATE FROM UI
The web application should control projects.
Heavy rendering should happen separately.
Conceptually:
Vercel
 ↓
Strategy Lab Studio
 ↓
Render Job
 ↓
Remotion / FFmpeg
 ↓
Output

Do not make Vercel's request lifecycle responsible for long 1080p/4K rendering.

69. PREVIEW VS FINAL RENDER
Draft Preview
fast
lower resolution
optimized assets
quick playback
Production Render
1080p
optional 1440p
optional 4K
original assets
full effects
The creator should not need to wait for 4K every time a keyframe changes.

70. PROXY SYSTEM
Eventually:
Original map: 4K
       ↓
Preview proxy: 720p
       ↓
Editing
       ↓
Final render: Original 4K

This is particularly important for smooth editing on the target development hardware.

71. EXPORT SYSTEM
The creator dictates exactly what gets rendered.
EXPORT A — FULL SCENE
Includes:
map
units
arrows
effects
camera
Output:
MP4

EXPORT B — TRANSPARENT TACTICAL OVERLAY
Includes:
units
arrows
effects
banners
highlights
No map.
Possible outputs:
ProRes 4444 where supported
WebM with alpha
PNG sequence
This is extremely valuable for CapCut/DaVinci compositing workflows.

EXPORT C — MAP ONLY
Map + camera.
Useful for establishing shots and alternative compositions.

EXPORT D — INDIVIDUAL SCENE CLIPS
Example:
01_battlefield.mp4
02_roman_advance.mp4
03_cavalry_flank.mp4
04_encirclement.mp4
05_collapse.mp4


EXPORT E — SELECTED OBJECTS
Example:
Cavalry
+
Arrow
+
Impact

No map.

EXPORT F — IMAGE SEQUENCE
PNG sequence for maximum post-production control.

72. EXPORT SETTINGS
Allow:
Resolution
1920×1080
2560×1440
3840×2160
FPS
24
25
30
60
Range
entire scene
selected range
Quality
Preview
Standard
High

73. RENDER QUEUE
Allow:
Scene 01
Scene 02
Scene 03
Scene 04

Then:
Render All
The creator can continue working while rendering occurs separately.

74. RENDER PRESETS
Save:
Strategy Lab 1080p
Strategy Lab 4K
Transparent Overlay
CapCut Scene
DaVinci Scene
Preview

75. LOCAL-FIRST PROJECT ARCHITECTURE
Because this is a private tool, do not overengineer the core.
A project should conceptually look like:
StrategyLab/
   Cannae/
      project.json

      maps/
         cannae_clean.png

      assets/
         infantry/
         cavalry/
         arrows/
         commanders/

      scenes/
         01.json
         02.json
         03.json

      renders/
         scene01.mp4
         scene02.mp4

Projects should be portable.

76. SUPABASE / PRIVATE CLOUD
Supabase can be used for:
private authentication
project metadata
scene JSON backup
asset metadata
cloud synchronization
optional storage
But:
Supabase must not become a dependency of the animation engine.
The core editor should still function around local project data.

77. PRIVATE AUTHENTICATION
The Studio is private.
Authentication should be restricted to the creator's authorized email.
No:
public signup
public onboarding
teams
organizations
billing
customer management
If Supabase Auth is used, enforce the single-authorized-email policy server-side as well as in the UI.

78. AUTOSAVE
Important changes should automatically save.
Example:
Saving...
✓ Saved

No fear of losing hours of animation work.

79. VERSIONING
Eventually support:
Cannae v1
Cannae v2
Cannae v3

and checkpoints.
Allow restoring earlier project states.

80. PROJECT DASHBOARD
Minimal:
STRATEGY LAB

Projects

[Cannae]
[Waterloo]
[Gaugamela]
[Teutoburg Forest]

+ New Battle

No unnecessary SaaS dashboard.

81. MINIMALIST UI
The main interface should be approximately:
┌──────────┬──────────────────────────┬───────────────┐
│          │                          │               │
│ ASSETS   │       BATTLEFIELD        │   INSPECTOR   │
│          │                          │               │
│ Infantry │                          │ Position      │
│ Cavalry  │          MAP             │ Rotation      │
│ Archer   │                          │ Scale         │
│ Arrow    │                          │ Opacity       │
│ Banner   │                          │ Path          │
│          │                          │ Keyframes     │
├──────────┴──────────────────────────┴───────────────┤
│                      TIMELINE                         │
└───────────────────────────────────────────────────────┘

AI Commander should be easily accessible without overwhelming the screen.
Advanced controls should appear contextually.

82. UI PRINCIPLE
The interface should feel closer to:
Figma + tactical map editor + simplified After Effects timeline + AI assistant
Not:
complicated professional NLE.
The user should understand the basics immediately.

83. CANVAS ARCHITECTURE
Important implementation rule
Do not build hundreds of battlefield objects as ordinary React DOM elements.
Use a suitable canvas-based rendering/editing architecture such as:
Konva.js / react-konva
PixiJS
another performant scene-graph/canvas solution
Remotion remains responsible for deterministic final rendering.
The editor and renderer should share the same scene model.

84. UNDO / REDO
Mandatory.
Support:
Ctrl/Cmd + Z
Ctrl/Cmd + Shift + Z

Use a robust state architecture such as:
Zustand + Immer
Redux
equivalent transactional state system
AI operations should be grouped into transactions.

85. KEYBOARD SHORTCUTS
Initial shortcuts:
Space = Play/Pause

Delete = Delete selected

G = Group

D = Duplicate

K = Add keyframe

M = Marker

F = Frame selected

Z = Zoom

Ctrl/Cmd + Z = Undo

Exact bindings can be refined.

86. SNAP / GUIDES
Optional:
grid snapping
object snapping
formation snapping
path snapping
map-landmark snapping
Allow snapping to be disabled.
Guides:
grid
center
safe area
coordinates

87. WORLD COORDINATE SYSTEM
Each map gets its own world coordinate space.
Example:
Map = 4096 × 4096

Object:
X = 1832
Y = 927

The camera operates in world coordinates.
This allows rendering at:
1080p
1440p
4K
without breaking battlefield positioning.

88. SCENE COMPOSITION
Each scene should contain:
Scene
 ├── Duration
 ├── Map
 ├── Objects
 ├── Groups
 ├── Camera
 ├── Effects
 ├── Markers
 └── Export Settings


89. AUDIO PHILOSOPHY
The Studio is not an audio editor.
Audio remains in:
CapCut / DaVinci
Narration may be generated externally using:
MiniMax
ElevenLabs
other voice tools
Music and SFX remain external.

90. OPTIONAL NARRATION REFERENCE
The Studio may import a temporary narration track purely for synchronization.
It should support:
waveform
timeline markers
event markers
Example:
"The Roman army advanced..."
              ↓
           MARKER

"Cavalry moved around the flank..."
              ↓
           MARKER

"Hannibal closed the trap."
              ↓
           MARKER

The final audio can still be replaced in CapCut.

91. TIMELINE MARKERS
Support:
Narration
Battle Event
Camera
Decisive Move
Arrow
Impact
Scene Change

92. CAPCUT / DAVINCI HANDOFF
The Studio intentionally stops before final filmmaking.
Exported footage becomes production material.
CapCut/DaVinci handles:
narration
music
SFX
subtitles
transitions
color
pacing
archival footage
additional images
final branding
final audio mix
This is intentional.

93. BRANDING SYSTEM
The Studio should enforce a consistent Strategy Lab visual language:
Tactical identity
Red vs Blue
clean unit silhouettes
signature arrows
consistent shadows
consistent labels
Cinematic identity
camera behavior
subtle 2.5D
restrained effects
decisive moments
Documentary identity
typography
dates
locations
commander markers
historical confidence labels

94. TYPOGRAPHY
Primary:
modern clean condensed/sans-serif
For:
labels
dates
armies
locations
tactical information
Optional secondary:
historical serif/display font
For:
battle names
historical titles
Avoid excessive decorative typography.

95. SIGNATURE OPENING
Optional reusable preset:
STRATEGY LAB

CANNAE
216 BC

Then transition into the battlefield.
Keep it short.

96. SIGNATURE ENDING
Optional visual space for:
THE LESSON
The Studio prepares the visual composition.
CapCut/DaVinci adds the final narration and typography treatment.

97. PERFORMANCE TARGET
The application should prioritize smooth operation on the primary development hardware.
Therefore:
avoid unnecessary full 3D
use optimized assets
use GPU-friendly canvas rendering
use SVG where appropriate
avoid loading huge assets unnecessarily
use proxies
preview at lower resolution
separate preview and production rendering

98. ARCHITECTURAL SEPARATION
This is one of the most important decisions in the entire project.
Separate:
CONTENT
Cavalry.svg

ANIMATION
Position
0 → 500

RENDERING
MP4

Never confuse the three.
This separation creates maximum freedom.

99. SINGLE SOURCE OF TRUTH
The scene model should power:
Editor
AI Commander
Preview
Save/Load
Remotion
Export

There should not be separate incompatible representations of the battlefield.

100. FIRST MVP
Do not build everything at once.
MVP-1
Must support:
project creation
clean map import
canvas
asset library
drag assets onto map
selection
move
scale
rotation
opacity
layers
timeline
position keyframes
scale keyframes
rotation keyframes
opacity keyframes
playback
scrubbing
basic easing
camera
camera keyframes
Remotion preview
MP4 export
If this works beautifully:
You already have a real Strategy Lab Studio.

101. MVP-2
Add:
Bezier paths
path editor
groups
formations
arrows
arrow draw-on
banners
commander markers
shadows
presets
scene system
scene duplication
transparent overlay export
individual scene export

102. MVP-3
Add:
2.5D
parallax
depth
advanced effects
battle-state system
reusable templates
proxy rendering
render queue
project versioning
narration markers

103. AI LAYER
Only after the core editor is stable.
Then add:
AI Commander
research assistant
battle chronology extraction
asset assistant
scene suggestions
formation suggestions
AI keyframe proposals
complex maneuver generation

104. BATTLE ASSISTANT
Future example:
"At this moment Hannibal's cavalry begins moving around the Roman right flank."
AI responds:
Suggested Action

Cavalry Group
Start: X/Y
Path: Bezier
End: X/Y
Duration: 5.2 sec
Easing: Ease In/Out

Buttons:
APPLY
MODIFY
REJECT
The result remains completely editable.

105. WHAT AI MUST NEVER DO
AI must never automatically:
render final battles
determine historical truth
replace the map
replace the timeline
overwrite keyframes without approval
make irreversible changes
publish content

106. HISTORICAL ACCURACY
The Studio does not determine historical truth.
Workflow remains:
Research
 ↓
Evidence
 ↓
Script
 ↓
Historical interpretation
 ↓
Animation

The software visualizes the creator's reconstruction.

107. ASSET STANDARD
Every Strategy Lab asset should follow:
clean silhouette
consistent perspective
consistent shadow
consistent scale
transparent background
recognizable at small size
low visual noise
compatible with red/blue system

108. MAP STANDARD
Preferred:
External map generation
        ↓
Clean map
        ↓
HD cleanup
        ↓
Strategy Lab Studio

The Studio does not need to generate maps.
This is intentional.
Better external map technology can be adopted later without changing the Studio.

109. ASSET GENERATION STANDARD
Similarly:
AI asset generation
        ↓
Transparent asset
        ↓
HD cleanup
        ↓
Strategy Lab Asset Library
        ↓
Studio

The asset can be replaced later.
The animation remains intact.

110. EXPORT PHILOSOPHY
The creator must always be able to decide:
Exactly what am I rendering?
Not simply:
"Generate video."
The export system is part of the creative control system.

111. FINAL SYSTEM ARCHITECTURE
                 STRATEGY LAB
                 INTERNAL STUDIO
                       │
          ┌────────────┴────────────┐
          │                         │
      EDITOR UI                 AI COMMANDER
          │                         │
   Canvas / Timeline          Tool Calling
          │                         │
          └────────────┬────────────┘
                       ↓
                  SCENE MODEL
                       │
          ┌────────────┼────────────┐
          ↓            ↓            ↓
       OBJECTS      TIMELINE      CAMERA
          │            │            │
          └────────────┼────────────┘
                       ↓
                  SCENE ENGINE
                       ↓
                    REMOTION
                       ↓
                    FFmpeg
                       ↓
                EXPORT SYSTEM
          ┌──────────┬───────────┐
          ↓          ↓           ↓
       Full MP4   Alpha      Scene Clips
                   Overlay
          └──────────┬───────────┘
                     ↓
               CAPCUT / DAVINCI
                     ↓
          Narration / Music / SFX
                     ↓
                Final Video


112. DEVELOPMENT PRIORITY
🔴 P0 — MUST WORK
project system
map import
asset import
canvas
object system
layers
drag/drop
position
rotation
scale
opacity
keyframes
timeline
playback
camera
Remotion
deterministic MP4 rendering
🟠 P1 — MAKE IT POWERFUL
Bezier paths
groups
parent/child transforms
formations
arrows
arrow draw-on
scene system
scene duplication
shadows
transparent exports
individual scene exports
🟡 P2 — MAKE IT BEAUTIFUL
2.5D
parallax
depth
effects
presets
commander markers
Decisive Move
Why It Worked
confidence labels
branding system
🟢 P3 — MAKE IT INTELLIGENT
AI Commander
tool calling
research assistant
scene suggestions
AI keyframe proposals
asset assistant
complex maneuver generation

113. CODING AGENT — ABSOLUTE RULES
Put these at the very top of the development specification.
DO NOT build Strategy Lab Internal Studio as an AI video generator.
Build it as a deterministic, object-based, commander-controlled battlefield animation editor.
Every important battlefield object must remain independently editable after placement and animation.
AI is optional and assistive.
AI must manipulate structured scene data through approved tools/functions.
AI must never directly render the video.
Remotion and FFmpeg are responsible for rendering.
The creator controls the battlefield, timeline, movement, camera, scene composition and exports.
CapCut/DaVinci remain the final filmmaking environment.
Do not build a full CapCut/DaVinci replacement.
Do not build unnecessary SaaS infrastructure.
Do not make the creator dependent on AI.
Do not use ordinary React DOM elements for hundreds of battlefield objects.
Do not expose hundreds of raw objects unnecessarily to the AI context.
Use a performant canvas/scene-graph architecture for editing.
The scene model is the single source of truth.

114. DEFINITION OF SUCCESS
The project succeeds when you can do this:
Import clean battlefield map
        ↓
Add Strategy Lab assets
        ↓
Create armies
        ↓
Create formations
        ↓
Place units
        ↓
Create movement paths
        ↓
Animate historically meaningful maneuvers
        ↓
Control camera
        ↓
Add arrows / highlights
        ↓
Preview
        ↓
Manually refine everything
        ↓
Choose export type
        ↓
Deterministically render
        ↓
Import footage into CapCut/DaVinci
        ↓
Create exceptional final video

If it can do that beautifully, smoothly, and reliably, the core product has succeeded.
Everything beyond that is an upgrade.

115. THE FINAL STRATEGY LAB ECOSYSTEM
                   RESEARCH
                       ↓
              Historical Sources
                       ↓
                    SCRIPT
                       ↓
                 CLEAN MAP
           Google Flow / Gemini etc.
                       ↓
                    ASSETS
              AI + Manual Cleanup
                       ↓
        ┌────────────────────────────┐
        │ STRATEGY LAB INTERNAL      │
        │ STUDIO                     │
        │                            │
        │ Map                        │
        │ + Units                    │
        │ + Formations               │
        │ + Paths                    │
        │ + Arrows                   │
        │ + Camera                   │
        │ + Effects                  │
        │ + AI Commander             │
        └─────────────┬──────────────┘
                      ↓
               REMOTION + FFMPEG
                      ↓
              PRODUCTION FOOTAGE
                      ↓
               CAPCUT / DAVINCI
                      ↓
           ┌──────────┼──────────┐
           ↓          ↓          ↓
       Narration    Music       SFX
           └──────────┼──────────┘
                      ↓
               FINAL EDITING
                      ↓
                STRATEGY LAB
                  YOUTUBE

116. THE REAL COMPETITIVE ADVANTAGE
The advantage is not AI generation.
It is:
Speed + control + repeatability + Strategy Lab's own visual language.
Instead of spending hours manually moving dozens of assets every time, you build a reusable system.
Instead of accepting whatever an AI video generator gives you, you control:
every unit.
every formation.
every path.
every arrow.
every camera move.
every timing decision.
And because everything remains structured, you can change your mind at any point.
That is the moat.

117. THE ONE-SENTENCE MASTER SPEC
If OpenCode remembers only one thing, it should be this:
Build a private Strategy Lab battlefield-animation studio where I import beautiful clean maps, independently place and animate every important tactical element, control everything manually or through structured AI commands, preview the live battlefield, and deterministically render professional battle-animation footage that I can finish in CapCut or DaVinci—while I remain the absolute commander at every stage.
That is the final PRD.
And boss, I would now freeze the product requirements. Don't keep adding major features before the first MVP works. The biggest danger at this point isn't that the idea is missing something—the danger is giving the coding agent 117 requirements and letting it attempt all of them simultaneously. Build P0 first, prove the core animation loop, then climb P1 → P2 → P3.


