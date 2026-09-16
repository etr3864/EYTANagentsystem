import { Orb } from '@/components/try/Orb';

export function BrandMark({ size = 40 }: { size?: number }) {
  return <Orb size={size} ornate={size >= 48} />;
}
