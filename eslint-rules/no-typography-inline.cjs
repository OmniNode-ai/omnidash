// eslint-rules/no-typography-inline.cjs
const TYPOGRAPHY_KEYS = new Set([
  'fontSize', 'fontFamily', 'fontWeight', 'fontVariantNumeric',
  'letterSpacing', 'textTransform', 'lineHeight', 'fontStyle',
]);

const ALLOWED_DIR = /src\/components\/ui\/typography\//;
const ALLOWED_FILE = /\.(test|stories)\.tsx?$/;

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow typographic CSS in JSX style props' },
    messages: {
      banned: 'Use <Text>/<Heading> instead of inline `style.{{ key }}`. See docs/adr/001-typography-system.md.',
    },
    schema: [],
  },
  create(context) {
    const filename = context.getFilename();
    if (ALLOWED_DIR.test(filename) || ALLOWED_FILE.test(filename)) return {};
    return {
      JSXAttribute(node) {
        if (node.name.name !== 'style') return;
        const expr = node.value && node.value.expression;
        if (!expr || expr.type !== 'ObjectExpression') return;
        for (const prop of expr.properties) {
          if (prop.type !== 'Property') continue;
          const keyName = prop.key.name || prop.key.value;
          if (TYPOGRAPHY_KEYS.has(keyName)) {
            context.report({ node: prop, messageId: 'banned', data: { key: keyName } });
          }
        }
      },
    };
  },
};
