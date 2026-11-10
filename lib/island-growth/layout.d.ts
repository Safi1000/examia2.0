// Types for layout.js (plain JS so the design mockups can load it in the browser too).
export type PieceKind = "t" | "s" | "b" | "c" | "p" | "B" | "l" | "w" | "f" | "o" | "P" | "T";
export interface Piece { i: number; kind: PieceKind; x: number; z: number; rot: number; s: number; k: number }
export declare const BLOCK_MINUTES: number;
export declare const MAX_PIECES: number;
export declare const FWD: [number, number];
export declare const RIGHT: [number, number];
export declare const PAD: { x: number; z: number; r: number };
export declare function piecesFor(totalMinutes: number | null | undefined): number;
export declare function seedFrom(id: string | number | null | undefined): number;
export declare function islandLayout(seed: number): Piece[];
export declare function growth(piece: Piece, pieces: number): { size: number; lit: boolean };
