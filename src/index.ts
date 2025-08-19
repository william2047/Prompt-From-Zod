import z, { core, ZodAny, infer, ZodBoolean, ZodNumber, ZodObject, ZodString, ZodType, ZodArray, ZodEnum } from "zod";
import { checkbox, confirm, input, select, number, editor } from "@inquirer/prompts";
import chalk from "chalk";


// numeric literals for a small depth budget
type N = 0 | 1 | 2 | 3 | 4 | 5;
type Prev = { 0: 0, 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 };
type Dec<D extends N> = Prev[D];

type CompatibleZodPrimary = ZodBoolean | ZodString | ZodNumber | ZodEnum;

type CompatibleZodArray = ZodArray<CompatibleZodPrimary>;

type CompatibleZodTypes<D extends N = 5> =
    | CompatibleZodPrimary
    | CompatibleZodArray
    | (D extends 0 ? never : CompatibleZodObject<D>);

type CompatibleZodObject<D extends N = 5> =
    ZodObject<Record<string, CompatibleZodTypes<Dec<D>>>, core.$strip>;



    
type InputPimaryPrompt<
    S extends CompatibleZodTypes,
    T = z.infer<S>
> = (message: string, schema: S, abortController?: AbortController) => Promise<T>




type InputLabelObject = { value: string, overiteDefault?: boolean }
type InputLabel = string | InputLabelObject;


type InputLabelsForSchema<S extends CompatibleZodTypes> =
    S extends ZodObject<infer Shape>
    ? {
        [K in keyof Shape]:
        Shape[K] extends ZodObject<any>
        ? InputLabelsForSchema<Shape[K]> // recurse for nested objects
        : InputLabel;                        // otherwise just a label string
    }
    : InputLabel;



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



const booleanPrompt: InputPimaryPrompt<ZodBoolean> = async (message, schema, abortController?) => {
    return await confirm({
        message,
    }, {signal: abortController?.signal})
}

const stringPrompt: InputPimaryPrompt<ZodString> = async (message, schema, abortController?) => {
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


const numberPrompt: InputPimaryPrompt<ZodNumber> = async (message, schema, abortController?) => {
    return await number({
        message,
        required: true,
        validate: zodParseToValidate(schema),
    }, { signal: abortController?.signal });
}

const enumPrompt: InputPimaryPrompt<ZodEnum> = async (message, schema, abortController?) => {
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
    T = z.infer<S["element"]>
>(message: string, schema: S, indentCount: number): Promise<T[]> {
    
    let prompt: InputPimaryPrompt<CompatibleZodPrimary>;
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
    const results: T[] = [];

    while(true){
        const controller = new AbortController();
        try{
            const result = await prompt(getIndent(indentCount), schema.element, controller) as T;
            results.push(result);
        }
        catch(error: any){
            if(error.name === 'AbortError' || error.message === 'AbortError' || error.name  === 'ExitPromptError'){
                break;
            }
        }    
    }
    return results
}





const indent = '   ';

function getBrace(braceChar: string, indentCount: number) {
    return '  ' + (indent).repeat(indentCount) + braceChar;
}
function getIndent(indentCount: number) {
    return (indent).repeat(indentCount);
}
function getInputMessage(indentCount: number, defaultMessage: string, propertyLabel?: InputLabel, mandatoryMessage?: string) {
    let message = '';
    defaultMessage = defaultMessage.trim().replace(/[:;\s]+$/, '');
    message += mandatoryMessage ? mandatoryMessage.trim().replace(/[:;\s]+$/, '') + ' | ' : '';

    if(typeof propertyLabel === 'string') {
        message += propertyLabel.replace(/[:;\s]+$/, '');
    }
    else if(propertyLabel){
        if(propertyLabel.overiteDefault){
            message += propertyLabel.value.trim().replace(/[:;\s]+$/, '');
        }
        else{
            message += `${propertyLabel.value} (${defaultMessage})`;
        }
    }
    else{
        message += defaultMessage;
    }
    return (getIndent(indentCount) + message + ": ")
}




async function schemaWalker<
    S extends CompatibleZodTypes,
    T = z.infer<S>
>(schema: S, propertyLabel?: InputLabelsForSchema<S>, indentCount: number = 0): Promise<T> {
    switch (true) {
        case schema instanceof ZodBoolean:
            return (await booleanPrompt(getInputMessage(indentCount, 'Boolean', propertyLabel as InputLabelObject | string), schema)) as T;
        case schema instanceof ZodString:
            return (await stringPrompt(getInputMessage(indentCount, 'String', propertyLabel as InputLabelObject | string), schema)) as T;
        case schema instanceof ZodNumber:
            return (await numberPrompt(getInputMessage(indentCount, 'Number', propertyLabel as InputLabelObject | string), schema)) as T;
        case schema instanceof ZodEnum:
            return (await enumPrompt(getInputMessage(indentCount, 'Enum', propertyLabel as InputLabelObject | string), schema)) as T;

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



async function promptsFromZod<
    S extends CompatibleZodTypes,
>(schema: S, propertyLabel?: InputLabelsForSchema<S>, doConfirm:boolean = true): Promise<z.infer<S>> {
    console.log(chalk.red('============================='))

    const results = await schemaWalker(schema, propertyLabel)

    console.log(chalk.red('============================='))

    let restart = false;
    if(doConfirm){
        restart = await confirm({
            message: chalk.green('Are you sure you want to submit the data? (no to restart)'),
        })
    }

    if(restart){
        return promptsFromZod(schema, propertyLabel, doConfirm);
    }    

    return results;
}

export default promptsFromZod;