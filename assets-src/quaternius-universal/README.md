# Quaternius universal characters and animations (source files, not used by the game yet)

Downloaded on 16 November 2026 for a possible character upgrade. Nothing in `src/` loads these
files. The folder is marked `export-ignore` in `.gitattributes`, so a deploy made from
`git archive` does not upload it.

All three packs are by Quaternius, CC0 1.0 (licence texts next to this file).

| Pack | Source | Original zip (sha256) |
|---|---|---|
| Universal Base Characters, Standard (free) | https://quaternius.itch.io/universal-base-characters | `fdbf1804c90dfc1ea03e992bff7da2dfd1a79318e13270a660180f9308455f40` |
| Universal Animation Library, Standard | https://opengameart.org/content/universal-animation-library | `18ff1a7215f4852b320203e8aaf02a1578b5c8eef9027fbaedfcedc7b85a3ac2` |
| Universal Animation Library 2, Standard | https://opengameart.org/content/universal-animation-library-2 | `ec0e40d6d78fe9aaad59e322f40865a8675c22f0745e291622e54520391a9217` |

## What is here

- `characters/`: the two base bodies of the free version (`Superhero_Male_FullBody`,
  `Superhero_Female_FullBody`, glTF + bin, about 14k triangles each, 65-bone rig) and eight
  hair/eyebrow/beard pieces rigged to the head bone. They are unclothed base bodies in underwear,
  meant to be dressed with separate outfit packs; the free version has no clothes and only the
  "superhero" build. The `Dark` / `Ligh(t)` body textures differ in underwear colour.
- `animations/UAL1_Standard.glb`: 46 clips (Idle_Loop, Walk_Loop, Jog_Fwd_Loop, Sprint_Loop,
  PickUp_Table, Interact, Push_Loop, Fixing_Kneeling, Sitting, Dance, Driving and others).
- `animations/UAL2_Standard.glb`: 43 clips (Walk_Carry_Loop, Farm_Harvest, Farm_PlantSeed,
  Farm_Watering, TreeChopping_Loop, OverhandThrow, Idle_FoldArms_Loop, Yes and others).

## Changed from the originals

- Textures were reduced from 2048 px to 1024 px (colour) and 512 px (normal, roughness).
- `T_Eye_Normal_png.png` and `T_Hair_1_Normal_png.png` are copies of `T_Eye_Normal.png` and
  `T_Hair_1_Normal.png`: the glTF files reference those names but the pack does not ship them.
- Left out: FBX and .blend files, the Unity/Unreal variants, "origin at 0" hair, the female
  mannequin, preview images.

## Notes for using them

- The characters and UAL2 use the same bone names (`pelvis`, `spine_01`, `upperarm_l` ...), so
  UAL2 clips play on the characters directly.
- UAL1 (Godot export) uses Blender names (`DEF-hips`, `DEF-upper_arm.L` ...) with the same rest
  pose as UAL2. Renaming the tracks is enough: hips→pelvis, spine.00N→spine_0N, neck→neck_01,
  head→Head, shoulder→clavicle, upper_arm→upperarm, forearm→lowerarm, shin→calf, toe→ball,
  f_index.0N→index_0N (same for middle, ring, pinky, thumb), `.L`/`.R`→`_l`/`_r`.
- Drop position tracks except the pelvis: the characters' proportions differ slightly from the
  mannequin's.
- The download from itch.io needs the hosts `quaternius.itch.io` and its file server; both are
  allowed in the SatisfyingGames cloud environment.
