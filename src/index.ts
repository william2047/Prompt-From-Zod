import z, { core, ZodAny, infer, ZodBoolean, ZodNumber, ZodObject, ZodString, ZodType } from "zod";
import { checkbox, confirm, input, select, number, editor } from "@inquirer/prompts";

type CompatibleZodPrimaryTypes =
    ZodBoolean |
    ZodString |
    ZodNumber;

type CompatibleZodTypes =
    CompatibleZodPrimaryTypes |
    ZodObject<Record<string, CompatibleZodPrimaryTypes | ZodObject>, core.$strip>


type InputPrompt<T> = (message: string, schema: CompatibleZodTypes) => Promise<T>



type InputLabelsForSchema<S extends CompatibleZodTypes> =
    S extends ZodObject<infer Shape>
    ? {
        [K in keyof Shape]:
        Shape[K] extends ZodObject<any>
        ? InputLabelsForSchema<Shape[K]> // recurse for nested objects
        : string;                        // otherwise just a label string
    }
    : string;


function zodParseToValidate<
    S extends CompatibleZodTypes,
    T extends z.infer<S>
>(schema: CompatibleZodTypes): (value: T) => Promise<boolean | string> {
    return async function (value: T) {
        const parsedValue = schema.safeParse(value);
        if (parsedValue.success) {
            return true
        }
        else {
            return parsedValue.error.issues.map(err => err.message).join(',\n');
        }
    }
}



const booleanPrompt: InputPrompt<boolean> = async (message) => {
    return await confirm({
        message,
    })
}

const stringPrompt: InputPrompt<string> = async (message, schema) => {
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
        })
    }
    else {
        return await input({
            message,
            required: true,
            validate: zodParseToValidate(schema),
        })
    }
}

const numberPrompt: InputPrompt<number> = async (message, schema) => {
    return await number({
        message,
        required: true,
        validate: zodParseToValidate(schema),
    })
}



async function schemaWalker<
    S extends CompatibleZodTypes,
    T = z.infer<S>
>(schema: S): Promise<T> {
    switch (schema.def.type) {
        case 'boolean':
            return (await booleanPrompt("Enter a boolean value:", schema)) as T;
        case 'string':
            return (await stringPrompt("Enter a string value:", schema)) as T;
        case 'number':
            return (await numberPrompt("Enter a number value:", schema)) as T;
        default:
            throw new Error(`Unsupported schema type.`);
    }
}



async function promptsFromZod<
    S extends CompatibleZodTypes,
    T = z.infer<S>
>(schema: S, propertyLabels?: InputLabelsForSchema<S>): Promise<T> {


    if (schema.def.type === 'object' && propertyLabels !== undefined) throw new Error('Property labels can only be used with ZodObject schemas');

}

export default promptsFromZod;




const test = z.array(z.number())
const test2 = z.object({
    name: z.string(),
    age: z.number(),
    hobbies: z.string(),
    clothes: z.object({
        shirt: z.string(),
        pants: z.string(),
        shoes: z.string()
    })
})

promptsFromZod(test2, {
    name: 'enter your name', age: '1', hobbies: 'enter your hobbies', clothes: {
        shirt: 'enter your shirt size',
        pants: 'enter your pants size',
        shoes: 'enter your shoe size'
    }
})


