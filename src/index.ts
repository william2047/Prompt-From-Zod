import z, { core, ZodBoolean, ZodNumber, ZodObject, ZodString, ZodArray, ZodEnum } from "zod";
import { confirm, input, select, number, editor } from "@inquirer/prompts";
import chalk from "chalk";

const indent = '   ' as const; // Define a constant for indentation



// numeric literals for a small depth budget
type N = 0 | 1 | 2 | 3 | 4 | 5;
type Prev = { 0: 0, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 };
type Dec<D extends N> = Prev[D];

// Define compatible Zod types for the schema
type CompatibleZodPrimary = ZodBoolean | ZodString | ZodNumber | ZodEnum;

// Define compatible Zod array type
type CompatibleZodArray = ZodArray<CompatibleZodPrimary>;

type CompatibleZodObject<D extends N = 5> =
    ZodObject<Record<string, CompatibleZodTypes<Dec<D>>>, core.$strip>;

// Define compatible Zod object type with a depth parameter
type CompatibleZodTypes<D extends N = 5> =
    | CompatibleZodPrimary
    | CompatibleZodArray
    | (D extends 0 ? never : CompatibleZodObject<D>);


// Define a type for the primary input prompt function
type InputPimaryPrompt<
    S extends CompatibleZodTypes
> = (message: string, schema: S, abortController?: AbortController) => Promise<z.infer<S>>


// Foundational types for input labels
type InputLabelObject = { value: string, overiteDefault?: boolean }
type InputLabel = string | InputLabelObject;



/**
 * A utility type that generates a structure of input labels for a given Zod schema.
 * 
 * This type recursively traverses a Zod schema and maps its shape to a corresponding
 * structure of input labels. For nested Zod objects, it recurses into their shape
 * and generates nested input label structures. For other types, it assigns a single
 * input label.
 * 
 * @template S - A Zod schema type that extends `CompatibleZodTypes`.
 * 
 * @typeParam S - The Zod schema type to generate input labels for.
 * 
 * @returns A mapped structure where:
 * - For Zod objects, it produces an object with keys corresponding to the schema's shape
 *   and values being either nested input label structures or a single input label.
 * - For other types, it directly assigns a single input label.
 */
type InputLabelsForSchema<S extends CompatibleZodTypes> =
    S extends ZodObject<infer Shape>
    ? {
        [K in keyof Shape]:
        Shape[K] extends ZodObject<any>
        ? InputLabelsForSchema<Shape[K]> // recurse for nested objects
        : InputLabel;                        // otherwise just a label string
    }
    : InputLabel;



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
 * `overiteDefault` flag.
 * @param mandatoryMessage - An optional mandatory message to prepend to the input 
 * message, separated by a pipe (`|`).
 * @returns The constructed input message string with the specified formatting.
 */
function getInputMessage(indentCount: number, defaultMessage: string, propertyLabel?: InputLabel, mandatoryMessage?: string) {
    let message = '';
    defaultMessage = defaultMessage.trim().replace(/[:;\s]+$/, '');
    message += mandatoryMessage ? mandatoryMessage.trim().replace(/[:;\s]+$/, '') + ' | ' : '';

    if (typeof propertyLabel === 'string') {
        message += propertyLabel.replace(/[:;\s]+$/, '');
    }
    else if (propertyLabel) {
        if (propertyLabel.overiteDefault) {
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
async function schemaWalker<
    S extends CompatibleZodTypes,
    T = z.infer<S>
>(schema: S, propertyLabel?: InputLabelsForSchema<S>, indentCount: number = 0): Promise<T> {
    // Case by case, handle the schema type
    switch (true) {
        case schema instanceof ZodBoolean:
            return (await booleanPrompt(getInputMessage(indentCount, 'Boolean', propertyLabel as InputLabelObject | string), schema)) as T;
        case schema instanceof ZodString:
            return (await stringPrompt(getInputMessage(indentCount, 'String', propertyLabel as InputLabelObject | string), schema)) as T;
        case schema instanceof ZodNumber:
            return (await numberPrompt(getInputMessage(indentCount, 'Number', propertyLabel as InputLabelObject | string), schema)) as T;
        case schema instanceof ZodEnum:
            return (await enumPrompt(getInputMessage(indentCount, 'Enum', propertyLabel as InputLabelObject | string), schema)) as T;

        // For objects, recursively walk through the shape
        case schema instanceof ZodObject:
            const object: Partial<T> = {}
            console.log(getBrace('{', indentCount));
            for (const key in schema.shape) {
                object[key as keyof T] = await schemaWalker(
                    schema.shape[key],
                    propertyLabel ? (propertyLabel as InputLabelsForSchema<CompatibleZodObject>)[key] : undefined,
                    indentCount + 1
                )
            }
            console.log(getBrace('}', indentCount));
            return object as T;

        // For arrays, use the arrayPrompt function
        case schema instanceof ZodArray:
            console.log(getBrace('[', indentCount));
            const arr = await arrayPrompt(
                getInputMessage(indentCount + 1, 'Array of values', propertyLabel as InputLabelObject | string, "Press Ctrl+C to Finalize"),
                schema,
                indentCount + 1
            )
            console.log(getBrace(']', indentCount));
            return arr as T

        default:
            throw new Error(`Unsupported schema type.`);
    }
}




/**
 * Generates and runs inquirer prompts based on an inputed schema.
 * 
 * This function traverses the provided Zod schema, dynamically generating prompts for each
 * field based on its type. It supports nested objects, arrays, and various primitive types.
 * Optionally, it allows for confirmation of the collected data and restarting the input process.
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
 * @param schema - The Zod schema to generate prompts for. The schema defines the structure
 *                 and validation rules for the expected input.
 * @param propertyLabel - An optional mapping of input labels for the schema fields. This can
 *                        be a string, an object with a `value` and `overiteDefault` flag, or
 *                        a nested structure matching the schema's shape.
 * @param doConfirm - A boolean flag indicating whether to prompt the user for confirmation
 *                    after collecting the input. Defaults to `true`.
 * 
 * @returns A promise that resolves to the collected and validated data, matching the inferred
 *          type of the provided schema (`z.infer<S>`).
 * 
 * @throws An error if an unsupported schema type is encountered during traversal.
 * 
 * @example
 * const schema = z.object({
 *   name: z.string(),
 *   age: z.number(),
 *   hobbies: z.array(z.string()),
 * });
 * 
 * const labels = {
 *   name: "Your full name",
 *   age: "Your age",
 *   hobbies: "List your hobbies",
 * };
 * 
 * promptFromZod(schema, labels).then((result) => {
 *   console.log("Collected Data:", result);
 * });
 */
async function promptFromZod<
    S extends CompatibleZodTypes,
>(schema: S, propertyLabel?: InputLabelsForSchema<S>, doConfirm: boolean = true): Promise<z.infer<S>> {
    console.log(chalk.red('============================='))

    const results = await schemaWalker(schema, propertyLabel)

    console.log(chalk.red('============================='))

    let restart = false;
    if (doConfirm) {
        restart = await confirm({
            message: chalk.green('Are you sure you want to submit the data? (no to restart)'),
        })
    }

    if (restart) {
        return promptFromZod(schema, propertyLabel, doConfirm);
    }

    return results;
}

export default promptFromZod;



// Ensure compatibility with CommonJS
if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = promptFromZod;
    module.exports.default = promptFromZod;
}