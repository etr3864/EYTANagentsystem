export const BUBBLE_MINE = '#18565c';
export const BUBBLE_AGENT = '#3a2d55';

const MINE_RADII = [
  '22px 18px 18px 5px',
  '20px 22px 16px 6px',
  '24px 16px 20px 4px',
  '18px 20px 18px 7px',
  '21px 17px 22px 5px',
] as const;

const AGENT_RADII = [
  '18px 22px 5px 18px',
  '22px 20px 6px 16px',
  '16px 24px 4px 20px',
  '20px 18px 7px 18px',
  '17px 21px 5px 22px',
] as const;

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function bubbleRadii(id: string, mine: boolean): string {
  const set = mine ? MINE_RADII : AGENT_RADII;
  return set[hashId(id) % set.length];
}
