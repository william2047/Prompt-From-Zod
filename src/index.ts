import z, { core, ZodAny, infer, ZodBoolean, ZodNumber, ZodObject, ZodString, ZodType } from "zod";
import { checkbox, confirm, input, select, number, editor } from "@inquirer/prompts";


// numeric literals for a small depth budget
type N = 0 | 1 | 2 | 3 | 4 | 5;
type Prev = { 0:0, 1:0, 2:1, 3:2, 4:3, 5:4 };
type Dec<D extends N> = Prev[D];

type CompatibleZodPrimary = ZodBoolean | ZodString | ZodNumber | ZodEnum;

type CompatibleZodArray = ZodArray<CompatibleZodPrimary>;

type CompatibleZodTypes<D extends N = 5> =
  | CompatibleZodPrimary
  | CompatibleZodArray
  | (D extends 0 ? never : CompatibleZodObject<D>);

type CompatibleZodObject<D extends N = 5> =
  ZodObject<Record<string, CompatibleZodTypes<Dec<D>>>, core.$strip>;



type InputPrompt<
    S extends CompatibleZodTypes,
    T = z.infer<S>
> = (message: string, schema: S) => Promise<T>



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



const booleanPrompt: InputPrompt<ZodBoolean> = async (message) => {
    return await confirm({
        message,
    })
}

const stringPrompt: InputPrompt<ZodString> = async (message, schema) => {
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


const numberPrompt: InputPrompt<ZodNumber> = async (message, schema) => {
    return await number({
        message,
        required: true,
        validate: zodParseToValidate(schema),
    })
}




const indent = '   ';

function getBrace(braceChar : string, indentCount: number) {
    return '  ' + (indent).repeat(indentCount) + braceChar;
}
function getIndent(indentCount: number){
    return (indent).repeat(indentCount);
}

// getIndent(indentCount) + (propertyLabel ? (propertyLabel as string): 'True or false (Boolean value)')

async function schemaWalker<
    S extends CompatibleZodTypes,
    T = z.infer<S>
>(schema: S, propertyLabel?: InputLabelsForSchema<S>, indentCount: number = 0): Promise<T> {
    switch (schema.def.type) {
        case 'boolean':
            return (await booleanPrompt(`${'\t'.repeat(indentCount)}Enter a boolean value: ${propertyLabel ? ("\n" + '\t'.repeat(indentCount) + propertyLabel as string) : ''}`, schema)) as T;
        case 'string':
            return (await stringPrompt(`${'\t'.repeat(indentCount)}Enter a string value: ${propertyLabel ? ("\n" + '\t'.repeat(indentCount) + propertyLabel as string) : ''}`, schema)) as T;
        case 'number':
            return (await numberPrompt(`${'\t'.repeat(indentCount)}Enter a number value: ${propertyLabel ? ("\n" + '\t'.repeat(indentCount) + propertyLabel as string) : ''}`, schema)) as T;
        default:
            throw new Error(`Unsupported schema type.`);
    }
}



async function promptsFromZod<
    S extends CompatibleZodTypes,
    T = z.infer<S>
>(schema: S, propertyLabel?: InputLabelsForSchema<S>): Promise<T> {


    if (schema.def.type === 'object' && propertyLabel !== undefined) throw new Error('Property labels can only be used with ZodObject schemas');

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


