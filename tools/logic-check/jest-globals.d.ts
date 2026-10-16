declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void | Promise<void>): void;
interface Matchers { toBe(v: unknown): void; toEqual(v: unknown): void; toThrow(v?: unknown): void; toBeNull(): void; toContain(v: string): void; toBeCloseTo(v: number, digits?: number): void; toBeGreaterThanOrEqual(v: number): void; not: Matchers; }
declare function expect(v: unknown): Matchers;
declare const Buffer: { from(s: string): { toString(enc?: string): string }; byteLength(s: string, enc?: string): number };
declare function atob(s: string): string;
