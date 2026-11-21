export const COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/

/** 게임 대화창 이름표 미리보기 (바탕 tagColor, 글자·테두리 #0c0a18, 굵게) */
export default function NameTag({ name, color }: { name: string; color: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 14px',
        background: COLOR_PATTERN.test(color) ? color : '#D4D6DE',
        color: '#0c0a18',
        border: '2px solid #0c0a18',
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {name || '이름'}
    </span>
  )
}
