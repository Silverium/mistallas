export type IconQueryMap = Record<string, string[]>

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const extractIconQueriesFromSources = (sources: Iterable<string>, collections: string[]): IconQueryMap => {
  const iconSets = new Map<string, Set<string>>()

  for (const collection of collections) {
    iconSets.set(collection, new Set<string>())
  }

  for (const source of sources) {
    for (const collection of collections) {
      const matcher = new RegExp(`i-${escapeRegExp(collection)}-([a-z0-9-]+)`, 'g')
      const iconSet = iconSets.get(collection)

      if (!iconSet) {
        continue
      }

      let match = matcher.exec(source)
      while (match) {
        const iconName = match[1]
        if (iconName) {
          iconSet.add(iconName)
        }

        match = matcher.exec(source)
      }
    }
  }

  return collections.reduce<IconQueryMap>((accumulator, collection) => {
    accumulator[collection] = Array.from(iconSets.get(collection) ?? []).sort()
    return accumulator
  }, {})
}
