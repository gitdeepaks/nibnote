import { Host, Picker, Text as SwiftText } from "@expo/ui/swift-ui";
import { pickerStyle, tag } from "@expo/ui/swift-ui/modifiers";
import { FolderId } from "@nibnote/shared";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRepository } from "../db/DatabaseProvider";
import { COVER_COLORS, DEFAULT_COVER } from "../features/library/covers";
import {
  PAGE_SIZE_OPTIONS,
  pageSizeFor,
  PageSizeKey,
  TEMPLATE_OPTIONS,
  templateFor,
  TemplateKey,
} from "../features/new-notebook/options";
import { colors } from "../theme/colors";

function SectionLabel({ children }: { readonly children: string }) {
  return (
    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.secondaryLabel }}>{children.toUpperCase()}</Text>
  );
}

export default function NewNotebookScreen() {
  const repository = useRepository();
  const params = useLocalSearchParams();
  const folderId = FolderId.safeParse(params["folderId"]);
  const [title, setTitle] = useState("");
  const [cover, setCover] = useState(DEFAULT_COVER);
  const [size, setSize] = useState<PageSizeKey>("a4Portrait");
  const [template, setTemplate] = useState<TemplateKey>("lined");

  const create = () => {
    const result = repository.notebooks.create({
      title,
      coverColor: cover,
      pageSize: pageSizeFor(size),
      defaultTemplate: templateFor(template),
      folderId: folderId.success ? folderId.data : null,
    });
    // Keep the sheet (and the typed title) open if creating fails.
    if (result.ok) router.back();
    else Alert.alert("Couldn't create the notebook", "The folder no longer exists. Pick another one and try again.");
  };

  return (
    <>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 24, gap: 24 }}
      >
        <View style={{ gap: 8 }}>
          <SectionLabel>Title</SectionLabel>
          <TextInput
            autoFocus
            value={title}
            onChangeText={setTitle}
            placeholder="Untitled notebook"
            placeholderTextColor={colors.tertiaryLabel}
            returnKeyType="done"
            onSubmitEditing={create}
            style={{
              fontSize: 17,
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderRadius: 10,
              borderCurve: "continuous",
              color: colors.label,
              backgroundColor: colors.secondaryBackground,
            }}
          />
        </View>

        <View style={{ gap: 10 }}>
          <SectionLabel>Cover</SectionLabel>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {COVER_COLORS.map((option) => {
              const selected = option.hex === cover;
              return (
                <Pressable
                  key={option.hex}
                  accessibilityRole="button"
                  accessibilityLabel={`${option.name} cover`}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setCover(option.hex);
                  }}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: option.hex,
                    borderWidth: selected ? 3 : StyleSheet.hairlineWidth,
                    borderColor: selected ? colors.tint : colors.separator,
                  }}
                />
              );
            })}
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <SectionLabel>Page size</SectionLabel>
          <Host matchContents>
            <Picker
              modifiers={[pickerStyle("segmented")]}
              selection={size}
              onSelectionChange={(selection) => {
                const parsed = PageSizeKey.safeParse(selection);
                if (parsed.success) setSize(parsed.data);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <SwiftText key={option.key} modifiers={[tag(option.key)]}>
                  {option.label}
                </SwiftText>
              ))}
            </Picker>
          </Host>
        </View>

        <View style={{ gap: 10 }}>
          <SectionLabel>Template</SectionLabel>
          <Host matchContents>
            <Picker
              modifiers={[pickerStyle("segmented")]}
              selection={template}
              onSelectionChange={(selection) => {
                const parsed = TemplateKey.safeParse(selection);
                if (parsed.success) setTemplate(parsed.data);
              }}
            >
              {TEMPLATE_OPTIONS.map((option) => (
                <SwiftText key={option.key} modifiers={[tag(option.key)]}>
                  {option.label}
                </SwiftText>
              ))}
            </Picker>
          </Host>
        </View>
      </ScrollView>
      <Stack.Screen.Title>New Notebook</Stack.Screen.Title>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          onPress={() => {
            router.back();
          }}
        >
          Cancel
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button onPress={create}>Create</Stack.Toolbar.Button>
      </Stack.Toolbar>
    </>
  );
}
