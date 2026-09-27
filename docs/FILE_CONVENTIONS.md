# File and Naming Conventions

## Language ID

Prefer standard short identifiers:

```text
id
en
es
fr
de
ja
ko
zh
```

Projects may use another stable identifier when needed.

## Novel slug

Convert the novel title to lowercase kebab-case.

```text
Lord of the Mysteries
-> lord-of-the-mysteries
```

Do not rename the project directory after translation has begun unless all internal paths are also migrated.

## Chapter number

Prefer zero padding based on expected scale.

```text
001
002
043
120
```

## Chapter title slug

Use lowercase kebab-case and remove punctuation that is unsafe in filenames.

```text
Chapter 12 — A Strange Visitor
-> 012-a-strange-visitor.md
```

## Chapter directories

Translated prose:

```text
chapters/
```

Translation memory recaps:

```text
recaps/
```

## Source text

If source chapters are stored in the repository, place them separately:

```text
source/
```

Do not mix source and translated chapter files in the same directory unless the project deliberately uses bilingual files.

## Stable paths

Once published, avoid renaming chapter files solely for stylistic reasons because neighboring navigation links may depend on them.
