import { defaultSchema, type Options } from "rehype-sanitize";

// GFM 표 정렬은 remark-gfm/mdast-util-to-hast가 align 속성으로 내보낸다.
// 정렬 3종만 허용하고 그 밖의 표 속성과 inline style은 계속 차단한다.
const TABLE_ALIGN_VALUES = ["left", "right", "center"] as const;

export const markdownSanitizeSchema: Options = {
  ...defaultSchema,
  clobberPrefix: "aads-md-",
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code || []), ["className", /^language-./]],
    span: [...(defaultSchema.attributes?.span || []), ["className", "hljs", /^hljs-/]],
    th: [...(defaultSchema.attributes?.th || []), ["align", ...TABLE_ALIGN_VALUES]],
    td: [...(defaultSchema.attributes?.td || []), ["align", ...TABLE_ALIGN_VALUES]],
  },
};
