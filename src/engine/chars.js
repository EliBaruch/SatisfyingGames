// Character and vehicle indirection. Every engine module and world gets its people and
// vehicles from here, never from an implementation file directly, so the whole game can
// switch implementation by editing this one file.
//
// Contract (any implementation must keep it):
//   makeCharacter(look) -> Object3D   feet at the origin, faces +Z, about 1.7 units tall.
//                                     `look` is a LOOKS entry or a plain object; unknown
//                                     fields are ignored. Scale it with obj.scale only.
//   animateCharacter(char, dt, { moving, speed, carrying, action })
//                                     advance its animation by dt. action: null | 'swing'
//                                     (harvest tool swing) | 'wave' | 'pickup' (others
//                                     are ignored).
//   LOOKS                             named looks: player, cutter, cashier (+ more).
//   randomCustomerLook() -> look      a random shopper/customer look.
//   makeTractor(color) -> Object3D    vehicle for the harvester role. Faces +Z.
//                                     userData: { wheels: Object3D[] (spun about X),
//                                     blade: Object3D | null (spun about X while
//                                     harvesting), bedAnchor: Object3D (stack parent) }.
//
// Today: the legacy code-built implementation. Later: the art kit's GLB implementation.
export { makeCharacter, animateCharacter, LOOKS, randomCustomerLook, makeTractor } from './legacy/characters.js';
