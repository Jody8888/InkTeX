// 采字分组。字符用 MathJax 输出的码位（减号是 −，撇号是 ′），生成时按码位查字形库。
export const GROUPS = [
  { name: '小写字母', chars: 'abcdefghijklmnopqrstuvwxyz' },
  { name: '大写字母', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
  { name: '数字', chars: '0123456789' },
  { name: '希腊字母', chars: 'αβγδεϵζηθϑικλμνξπρστυφϕχψωΓΔΘΛΞΠΣΥΦΨΩ' },
  { name: '运算关系', chars: '+−×÷·±∓=≠≈≡∼≤≥<>∝→←↔⇒⇔∞∂∇ℏ∈∉⊂⊆∪∩∅∀∃∴∵°′' },
  { name: '括号标点', chars: '()[]{}|‖,.:;/!?%⟨⟩^~' },
  { name: '大型符号', chars: '∫∮∑∏√' },
  { name: '加高符号', chars: '∫∑∏√()[]{}|', tall: true },
  { name: '常用汉字', chars: '解答由得所以因为故即设则代入可知有和的是当时又且其中令求证明题意已同理综上，。：；（）、' },
].map(g => ({ ...g, chars: Array.from(g.chars) }));

export const keyOf = (ch, tall) => tall ? 'T:' + ch : ch;

// 采字格子尺寸（em）：宽度，以及普通/加高格子的上下边界（基线为 0，向下为正）
export const CELL = { w: 1.5, normal: [-1.05, 0.45], tall: [-2, 1] };
