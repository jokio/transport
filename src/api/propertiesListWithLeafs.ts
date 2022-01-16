// deno-lint-ignore-file no-explicit-any
export function propertiesListWithLeafs(
  obj: any,
  skipParts: string[] = [],
): [string, any][] {
  const isObject = (val: any) =>
    typeof val === 'object' && !Array.isArray(val)

  const addDelimiter = (a: any, b: any) => (a ? `${a}.${b}` : b)

  const paths: any = (obj = {}, head = '', level = 0) =>
    obj && typeof obj === 'object'
      ? Object.entries(obj).reduce((r, [key, value]) => {
          const fullPath = skipParts.includes(key)
            ? head
            : addDelimiter(head, key)

          if (isObject(value)) {
            // limit depth only to 20 levels
            if (level > 20) {
              return r
            }

            const innerResult = paths(
              value as any,
              fullPath,
              level + 1,
            )

            return [...r, ...innerResult]
          }

          return typeof value === 'function'
            ? [...r, [fullPath, obj ? value.bind(obj) : value]]
            : r
        }, [] as [string, unknown][])
      : []

  return paths(obj)
}
