import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const alt = 'קישור לבדיקת עובד הבינה המלאכותית שלך';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  const icon = await readFile(join(process.cwd(), 'public/try-icon.png'));
  const src = `data:image/png;base64,${icon.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(165deg, #2e1065 0%, #1a0b2e 48%, #0b0614 100%)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: 520,
            height: 520,
            borderRadius: 999,
            background: 'radial-gradient(circle, rgba(168,85,247,0.35) 0%, transparent 70%)',
            top: -80,
            right: -40,
          }}
        />
        <div
          style={{
            width: 196,
            height: 196,
            borderRadius: 48,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.16)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img src={src} width={132} height={132} alt="" />
        </div>
        <div
          style={{
            marginTop: 36,
            fontSize: 28,
            letterSpacing: 4,
            color: 'rgba(255,255,255,0.55)',
            fontFamily: 'sans-serif',
          }}
        >
          OPTIVE
        </div>
      </div>
    ),
    { ...size },
  );
}
