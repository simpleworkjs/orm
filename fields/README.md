# Custom Fields in Sequelize

## What is a Field?

In Sequelize, a field represents an attribute in a model. Fields define the structure and properties of data stored in a table.

## Common Options for All Fields

All custom fields share common options that define their behavior within a model. These options include:

- `primaryKey`: Boolean, indicating if the field is a primary key. (Default: `false`)
- `unique`: Boolean, indicating if the field values must be unique. (Default: `false`)
- `isRequired`: Boolean, indicating if the field is required. (Default: `false`)
- `isPrivate`: Boolean, indicating if the field should be treated as private. (Default: `false`)
- `isEditable`: Boolean, indicating if the field is editable. (Default: `true`)
- `defaultValue`: Default value for the field.

## Supported Custom Field Types

### FieldDate

Represents a date field.

### FieldPastDate

Extends `FieldDate` and represents a date field allowing only past dates.

### FieldFutureDate

Extends `FieldDate` and represents a date field allowing only future dates.

#### Additional Options:

- None

### FieldTime

Represents a time field.

#### Additional Options:

- None

### FieldPastTime

Extends `FieldTime` and represents a time field allowing only past times.

#### Additional Options:

- None

### FieldFutureTime

Extends `FieldTime` and represents a time field allowing only future times.

#### Additional Options:

- None

### FieldString

Represents a string field.

#### Additional Options:

- `min`: Minimum length of the string. (Default: `undefined`)
- `max`: Maximum length of the string. (Default: `255`)

### FieldUUIDv4

Represents a UUIDv4 field.

### FieldPassword

Extends `FieldString` and represents a password field.

#### Additional Options:

- `saltRounds`: Number of salt rounds for password hashing. (Default: `10`)
- `complexityFunctions`: Object with functions for additional password complexity checks.

### FieldEmail

Extends `FieldString` and represents an email field.

### FieldInteger

Represents an integer field.

#### Additional Options:

- `min`: Minimum value for the integer. (Default: `undefined`)
- `max`: Maximum value for the integer. (Default: `undefined`)


### FieldFloat

Represents a float field.

#### Additional Options:

- `min`: Minimum value for the float. (Default: `undefined`)
- `max`: Maximum value for the float. (Default: `undefined`)
