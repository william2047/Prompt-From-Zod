import z, { core, ZodBoolean, ZodNumber, ZodObject, ZodString, ZodArray, ZodEnum, ZodUnknown, ZodAny, ZodType } from "zod";
import { confirm, input, select, number, editor } from "@inquirer/prompts";
import chalk from "chalk";
import { ZodTypeAny } from "zod/v3";
import { $ZodArray, $ZodType } from "zod/v4/core";

const indent = '   ' as const; // Define a constant for indentation



// numeric literals for a small depth budget
type N = 0 | 1 | 2 | 3 | 4 | 5;
type Prev = { 0: 0, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 };
type Dec<D extends N> = Prev[D];

// Define compatible Zod types for the schema
export type CompatibleZodPrimary = ZodBoolean | ZodString | ZodNumber | ZodEnum;

// Define compatible Zod array type
export type CompatibleZodArray = ZodArray<CompatibleZodPrimary>;

export type CompatibleZodObject<D extends N = 5> =
    ZodObject<Record<string, CompatibleZodTypes<Dec<D>>>, core.$strip>;

// Define compatible Zod object type with a depth parameter
export type CompatibleZodTypes<D extends N = 5> =
    | CompatibleZodPrimary
    | CompatibleZodArray
    | (D extends 0 ? never : CompatibleZodObject<D>);


// Define a type for the primary input prompt function
type InputPimaryPrompt<
    S extends CompatibleZodTypes
> = (message: string, schema: S, abortController?: AbortController) => Promise<z.infer<S>>


// Foundational types for input labels
type InputLabelFull = { value: string, overwriteDefault?: boolean }
type InputLabelObject<S extends CompatibleZodObject> ={
    value: string,
    items:{
        [K in keyof S['shape']]: InputLabel<S['shape'][K]>
    }
}
type InputLabel<S extends CompatibleZodTypes> =
    S extends ZodObject<any>
        ? InputLabelObject<S>
        : InputLabelFull | string





/**
 * A utility function that takes a Zod schema and returns a validation function.
 * The returned function validates a given value against the schema and returns
 * either `true` if the value is valid or a string containing error messages if invalid.
 *
 * @template S - A type extending `CompatibleZodTypes`, representing the Zod schema type.
 * @param schema - The Zod schema to validate the input value against.
 * @returns A function that takes a value of type `z.infer<S>` and returns a Promise
 *          resolving to `true` if the value is valid, or a string of error messages if invalid.
 */
function zodParseToValidate<
    S extends CompatibleZodTypes,
>(schema: CompatibleZodTypes): (value: z.infer<S>) => Promise<boolean | string> {
    return async function (value: z.infer<S>) {
        const parsedValue = schema.safeParse(value);
        if (parsedValue.success) {
            return true
        }
        else {
            return parsedValue.error.issues.map(err => err.message).join(',\n');
        }
    }
}



const booleanPrompt: InputPimaryPrompt<ZodBoolean> = async (message, schema, abortController?): Promise<boolean> => {
    return await confirm({
        message,
    }, { signal: abortController?.signal })
}


const stringPrompt: InputPimaryPrompt<ZodString> = async (message, schema, abortController?): Promise<string> => {
    // Normalizes the type to lowercase for comparison
    const metaType = (typeof schema.meta()?.type === 'string') ? ((schema.meta() as { type: string }).type as string).toLowerCase() : undefined;
    if (
        metaType && (
            metaType === 'longtext' ||
            metaType === 'textarea' ||
            metaType === 'markdown' ||
            metaType === 'richtext' ||
            metaType === 'long' ||
            metaType === 'big' ||
            metaType === 'bigtext'
        )) {
        return await editor({
            message,
            validate: zodParseToValidate(schema),
        }, { signal: abortController?.signal });
    }
    else {
        return await input({
            message,
            required: true,
            validate: zodParseToValidate(schema),
        }, { signal: abortController?.signal });
    }
}


const numberPrompt: InputPimaryPrompt<ZodNumber> = async (message, schema, abortController?): Promise<number> => {
    return await number({
        message,
        required: true,
        validate: zodParseToValidate(schema),
    }, { signal: abortController?.signal });
}


const enumPrompt: InputPimaryPrompt<ZodEnum> = async (message, schema, abortController?): Promise<z.infer<typeof schema>> => {
    return await select({
        choices: schema.options.map(option => ({
            name: option as string,
            value: option as string,
        })),
        message,
    }, { signal: abortController?.signal });
}



async function arrayPrompt<
    S extends CompatibleZodArray,
>(message: string, schema: S, indentCount: number): Promise<z.infer<S['element'][]>> {

    // Determines the prompt fn based on the element type of the array schema
    let prompt: InputPimaryPrompt<S['element']>;
    switch (true) {
        case schema.element instanceof ZodBoolean:
            prompt = booleanPrompt as InputPimaryPrompt<CompatibleZodPrimary>;
            break;
        case schema.element instanceof ZodString:
            prompt = stringPrompt as InputPimaryPrompt<CompatibleZodPrimary>;
            break;
        case schema.element instanceof ZodNumber:
            prompt = numberPrompt as InputPimaryPrompt<CompatibleZodPrimary>;
            break;
        case schema.element instanceof ZodEnum:
            prompt = enumPrompt as InputPimaryPrompt<CompatibleZodPrimary>;
            break;
        default:
            throw new Error(`Unsupported array element type.`);
    }



    console.log(message);
    const results: z.infer<S['element']>[] = [];

    // Prompt for array elements until the user decides to stop (AbortError or ExitPromptError triggered by Ctrl+C)
    while (true) {
        const controller = new AbortController();
        try {
            const result = await prompt(getIndent(indentCount), schema.element, controller)
            results.push(result);
        }
        catch (error: any) {
            if (error.name === 'AbortError' || error.message === 'AbortError' || error.name === 'ExitPromptError') {
                break;
            }
        }
    }
    return results
}



/**
 * Generates a string representing a brace character with a specified indentation.
 *
 * @param braceChar - The brace character to include in the output (e.g., '{', '}', etc.).
 * @param indentCount - The number of indentation levels to apply.
 * @returns A string containing the brace character preceded by the specified indentation.
 */
function getBrace(braceChar: string, indentCount: number) {
    return '  ' + (indent).repeat(indentCount) + braceChar;
}


/**
 * Generates a string consisting of repeated indentation characters.
 *
 * @param indentCount - The number of times the indentation character should be repeated.
 * @returns A string containing the repeated indentation characters.
 */
function getIndent(indentCount: number) {
    return (indent).repeat(indentCount);
}


/**
 * Constructs an input message string with optional indentation, default message, 
 * property label, and mandatory message.
 *
 * @param indentCount - The number of indentation levels to prepend to the message.
 * @param defaultMessage - The default message to be included in the input message.
 * @param propertyLabel - An optional label for the property. If a string is provided, 
 * it will be used directly. If an object is provided, its `value` property will be 
 * used, and it may optionally override the default message based on the 
 * `overwriteDefault` flag.
 * @param mandatoryMessage - An optional mandatory message to prepend to the input 
 * message, separated by a pipe (`|`).
 * @returns The constructed input message string with the specified formatting.
 */
function getInputMessage(indentCount: number, defaultMessage: string, propertyLabel?: InputLabelFull | string, mandatoryMessage?: string) {
    let message = '';
    defaultMessage = defaultMessage.trim().replace(/[:;\s]+$/, '');
    message += mandatoryMessage ? mandatoryMessage.trim().replace(/[:;\s]+$/, '') + ' | ' : '';

    if (typeof propertyLabel === 'string') {
        message += propertyLabel.replace(/[:;\s]+$/, '');
    }
    else if (propertyLabel) {
        if (propertyLabel.overwriteDefault) {
            message += propertyLabel.value.trim().replace(/[:;\s]+$/, '');
        }
        else {
            message += `${propertyLabel.value} (${defaultMessage})`;
        }
    }
    else {
        message += defaultMessage;
    }
    return (getIndent(indentCount) + message + ": ")
}



// Recursively walks through the Zod schema and prompts for input based on the schema type.
async function schemaWalker<S extends CompatibleZodTypes, T = z.infer<S>>(
    schema: S,
    propertyLabel?: InputLabel<S>,
    indentCount: number = 0
): Promise<T> {
    if (schema instanceof ZodBoolean) {
        return await booleanPrompt(getInputMessage(indentCount, 'Boolean', propertyLabel), schema) as T;
    }

    if (schema instanceof ZodString) {
        return await stringPrompt(getInputMessage(indentCount, 'String', propertyLabel), schema) as T;
    }

    if (schema instanceof ZodNumber) {
        return await numberPrompt(getInputMessage(indentCount, 'Number', propertyLabel), schema) as T;
    }

    if (schema instanceof ZodEnum) {
        return await enumPrompt(getInputMessage(indentCount, 'Enum', propertyLabel), schema) as T;
    }

    if (schema instanceof ZodObject) {
        const object: Partial<T> = {};

        console.log(
            getBrace(
                '{ ' + getInputMessage(
                    0,
                    'Object',
                    propertyLabel ? (propertyLabel as InputLabel<CompatibleZodObject>).value : undefined
                ),
                indentCount
            )
        );

        for (const key in schema.shape) {
            object[key as keyof T] = await schemaWalker(
                schema.shape[key],
                propertyLabel
                    ? (propertyLabel as InputLabel<CompatibleZodObject>).items[key]
                    : {
                        value: key,
                        overwriteDefault: false,
                        items: schema.shape[key] instanceof ZodObject
                            ? Object.keys(schema.shape[key].shape).reduce((acc, k) => {
                                acc[k] = { value: k, overwriteDefault: false };
                                return acc;
                            }, {} as Record<string, InputLabelFull>)
                            : undefined

                    },
                indentCount + 1
            );
        }

        console.log(getBrace('}', indentCount));
        return object as T;
    }

    if (schema instanceof ZodArray) {
        const arr = await arrayPrompt(
            getBrace(
                '[ ' +
                    getInputMessage(
                        0,
                        'Array of values',
                        propertyLabel as InputLabel<CompatibleZodArray>,
                        'Press Ctrl+C to Finalize'
                    ),
                indentCount
            ),
            schema,
            indentCount + 1
        );
        console.log(getBrace(']', indentCount));
        return arr as T;
    }

    throw new Error(`Unsupported schema type.`);
}


/**
 * Validates a Zod schema and determines if it is compatible with a set of predefined types.
 *
 * @template T - The type of the Zod schema being validated.
 * @param schema - The Zod schema to validate. It can be of any type extending `$ZodType<any>`.
 * @param boolReturn - A boolean flag indicating the return type of the function:
 *   - If `true`, the function returns a boolean indicating whether the schema is valid.
 *   - If `false` (default), the function returns the schema cast to a compatible type if valid, or `false` if invalid.
 * @returns A boolean or a compatible Zod type:
 *   - If `boolReturn` is `true`, returns `true` if the schema is valid, otherwise `false`.
 *   - If `boolReturn` is `false`, returns the schema cast to a compatible type if valid, otherwise `false`.
 *
 * @remarks
 * The function checks if the schema is an instance of specific Zod types (`ZodBoolean`, `ZodString`, `ZodNumber`, `ZodEnum`, `ZodArray`, or `ZodObject`).
 * For `ZodArray`, it recursively validates the element type.
 * For `ZodObject`, it validates all properties in the schema's shape.
 *
 * @throws This function does not throw exceptions but returns `false` for unsupported or invalid schemas.
 *
 * @example
 * ```typescript
 * import { z } from "zod";
 *
 * const schema = z.object({
 *   name: z.string(),
 *   age: z.number(),
 * });
 *
 * const result = schemaValidator(schema);
 * console.log(result); // Outputs the schema if valid, or `false` if invalid.
 * ```
 */
export function schemaValidator(schema: $ZodType<any>, boolReturn: boolean = false): CompatibleZodTypes | boolean{
    if(
        (schema instanceof ZodBoolean) ||
        (schema instanceof ZodString) ||
        (schema instanceof ZodNumber) ||
        (schema instanceof ZodEnum)
    ){
        return boolReturn? true : schema as CompatibleZodPrimary;
    }
    if(schema instanceof ZodArray){
        return schemaValidator(schema.element)
            ? boolReturn
                ? true
                : (schema as CompatibleZodArray)
            : false;
    }
    if(schema instanceof ZodObject){
        const shape = schema.shape;
        for(const key in shape){
            if(!schemaValidator(shape[key], true)){
                return false;
            }
        }
        return boolReturn? true : (schema as CompatibleZodObject);
    }

    return false;
}




/**
 * Asynchronously prompts the user for input based on a Zod schema and returns the validated data.
 * 
 * Compatible schemas:
 *  Primary Types:
 *  - `ZodBoolean`: Prompts for a boolean value.
 *  - `ZodString`: Prompts for a string value, with support for long text or editor input based on metadata.
 *  - `ZodNumber`: Prompts for a numeric value.
 *  - `ZodEnum`: Prompts for a selection from predefined enum options.
 *  Nested Structures:
 *  - `ZodArray`: Prompts for an array of compatible primary types.
 *  - `ZodObject`: Prompts for primary types or nested structures, with a depth limit of 5 levels.

 * 
 * @template S - A type extending `CompatibleZodTypes`, representing the Zod schema type.
 * 
 * @param schema - The Zod schema used to validate the user input.
 * @param propertyLabel - (Optional) A mapping of schema properties to input labels for user prompts.
 * @param doConfirm - (Optional) A boolean indicating whether to confirm the input before submission. Defaults to `true`.
 * 
 * @returns A promise that resolves to the validated data conforming to the provided schema.
 * 
 * @remarks
 * - The function uses `schemaWalker` to traverse the schema and collect user input.
 * - If `doConfirm` is `true`, the user is prompted to confirm their input. If they choose not to confirm, the function restarts the input process.
 * - The function uses recursion to restart the input process if the user opts to restart.
 * 
 * @example
 * ```typescript
 * const schema = z.object({
 *   name: z.string(),
 *   age: z.number(),
 * });
 * 
 * const result = await promptFromZod(schema, { name: "Your Name", age: "Your Age" });
 * console.log(result);
 * ```
 */
async function promptFromZod<
    S extends CompatibleZodTypes,
>(schema: S, propertyLabel?: InputLabel<S>, doConfirm: boolean = true): Promise<z.infer<S>> {
    console.log(chalk.red('============================='))

    const results = await schemaWalker(schema, propertyLabel)

    console.log(chalk.red('============================='))

    let restart = false;
    if (doConfirm) {
        restart = !(await confirm({
            message: chalk.green('Are you sure you want to submit the data? (no to restart)'),
        }))
    }

    if (restart) {
        return promptFromZod(schema, propertyLabel, doConfirm);
    }

    return results;
}

export default promptFromZod;