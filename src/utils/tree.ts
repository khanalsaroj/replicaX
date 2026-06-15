/**
 * Render a sorted list of POSIX directory paths as an ASCII tree, the way the
 * PRD illustrates project structure.
 */
interface TreeNode {
  name: string;
  children: Map<string, TreeNode>;
}

function emptyNode(name: string): TreeNode {
  return { name, children: new Map() };
}

export function renderTree(directories: string[], rootLabel = '.'): string {
  const root = emptyNode(rootLabel);

  for (const dir of directories) {
    let cursor = root;
    for (const segment of dir.split('/')) {
      if (!segment) continue;
      let child = cursor.children.get(segment);
      if (!child) {
        child = emptyNode(segment);
        cursor.children.set(segment, child);
      }
      cursor = child;
    }
  }

  const lines: string[] = [root.name + '/'];
  const walk = (node: TreeNode, prefix: string): void => {
    const children = [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name));
    children.forEach((child, index) => {
      const last = index === children.length - 1;
      lines.push(`${prefix}${last ? '└── ' : '├── '}${child.name}/`);
      walk(child, `${prefix}${last ? '    ' : '│   '}`);
    });
  };
  walk(root, '');

  return lines.join('\n');
}
