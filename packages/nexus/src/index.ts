import { getInputType, hasEmptyTypeFields, PrismaSelect } from '@paljs/plugins';
import {
  enumType,
  inputObjectType,
  objectType,
  plugin,
  scalarType,
} from '@nexus/schema';
import { NexusAcceptedTypeDef } from '@nexus/schema/dist/builder';
import { dmmf } from '@prisma/client';
import { DMMF } from '@prisma/client/runtime';
import { adminNexusSchemaSettings } from './admin';
import { Settings } from './settings';

export { Settings };

export const paljs = (settings?: Settings) =>
  plugin({
    name: 'paljs',
    description:
      'paljs plugin to add Prisma select to your resolver and prisma admin queries and mutations and all models input types',
    onInstall() {
      const data: DMMF.Schema | undefined =
        settings?.dmmf?.schema || dmmf?.schema;
      const nexusSchemaInputs: NexusAcceptedTypeDef[] = [
        objectType({
          name: 'BatchPayload',
          definition(t) {
            t.int('count', { nullable: false });
          },
        }),
        scalarType({
          name: 'Json',
          asNexusMethod: 'json',
          description: 'Json custom scalar type',
          serialize(value) {
            return value;
          },
        }),
      ];
      nexusSchemaInputs.push(
        scalarType({
          name: 'DateTime',
          asNexusMethod: 'date',
          description: 'Date custom scalar type',
          parseValue(value: any) {
            return value ? new Date(value) : null;
          },
          serialize(value: any) {
            return value ? new Date(value) : null;
          },
          parseLiteral(ast: any) {
            return ast.value ? new Date(ast.value) : null;
          },
        }),
      );
      if (data) {
        const enums = [...data.enumTypes.prisma];
        if (data.enumTypes.model) enums.push(...data.enumTypes.model);
        enums.forEach((item) => {
          nexusSchemaInputs.push(
            enumType({
              name: item.name,
              members: item.values,
            }),
          );
        });
        const inputObjectTypes = [...data.inputObjectTypes.prisma];
        if (data.inputObjectTypes.model)
          inputObjectTypes.push(...data.inputObjectTypes.model);
        inputObjectTypes.forEach((input) => {
          if (input.fields.length > 0) {
            nexusSchemaInputs.push(
              inputObjectType({
                name: input.name,
                definition(t) {
                  input.fields.forEach((field) => {
                    const inputType = getInputType(field, settings);
                    const hasEmptyType =
                      inputType.location === 'inputObjectTypes' &&
                      hasEmptyTypeFields(inputType.type as string);
                    if (!hasEmptyType) {
                      const fieldConfig: {
                        [key: string]: any;
                        type: string;
                      } = {
                        type: inputType.type as string,
                      };
                      if (field.isRequired) fieldConfig['nullable'] = false;
                      if (inputType.isList) fieldConfig['list'] = true;
                      t.field(field.name, fieldConfig);
                    }
                  });
                },
              }),
            );
          }
        });
        data.outputObjectTypes.prisma
          .filter((type) => type.name.includes('Aggregate'))
          .forEach((type) => {
            nexusSchemaInputs.push(
              objectType({
                name: type.name,
                definition(t) {
                  type.fields.forEach((field) => {
                    const fieldConfig: { [key: string]: any; type: string } = {
                      type: field.outputType.type as string,
                    };
                    if (field.isRequired) fieldConfig['nullable'] = false;
                    if (field.outputType.isList) fieldConfig['list'] = true;
                    t.field(field.name, fieldConfig);
                  });
                },
              }),
            );
          });
      }
      if (settings?.includeAdmin) {
        nexusSchemaInputs.push(
          ...adminNexusSchemaSettings(settings?.adminSchemaPath),
        );
      }
      return { types: nexusSchemaInputs };
    },
    onCreateFieldResolver() {
      return async (root, args, ctx, info: any, next) => {
        ctx.select = new PrismaSelect(
          info,
          settings?.prismaSelectOptions,
        ).value;
        return await next(root, args, ctx, info);
      };
    },
  });
