/**
 * RecipeFormModal — create or edit a custom recipe
 * @author Subash Karki
 */
import { Button, Group, Modal, Select, Stack, TextInput } from '@mantine/core';
import { useEffect, useState } from 'react';
import type { CustomRecipe } from '../atoms/recipes';

type RecipeFormMode = 'create' | 'edit';

interface RecipeFormModalProps {
  opened: boolean;
  onClose: () => void;
  onSubmit: (label: string, command: string, category: CustomRecipe['category']) => void;
  mode: RecipeFormMode;
  initialValues?: { label: string; command: string; category: CustomRecipe['category'] };
}

const CATEGORY_OPTIONS = [
  { value: 'custom', label: 'Custom' },
  { value: 'setup', label: 'Setup' },
  { value: 'test', label: 'Test' },
  { value: 'lint', label: 'Lint' },
  { value: 'build', label: 'Build' },
  { value: 'serve', label: 'Serve' },
  { value: 'deploy', label: 'Deploy' },
];

export const RecipeFormModal = ({
  opened,
  onClose,
  onSubmit,
  mode,
  initialValues,
}: RecipeFormModalProps) => {
  const [label, setLabel] = useState('');
  const [command, setCommand] = useState('');
  const [category, setCategory] = useState<CustomRecipe['category']>('custom');

  useEffect(() => {
    if (opened) {
      if (mode === 'edit' && initialValues) {
        setLabel(initialValues.label);
        setCommand(initialValues.command);
        setCategory(initialValues.category);
      } else {
        setLabel('');
        setCommand('');
        setCategory('custom');
      }
    }
  }, [opened, mode, initialValues]);

  const handleSubmit = () => {
    const trimmedLabel = label.trim();
    const trimmedCommand = command.trim();
    if (trimmedLabel && trimmedCommand) {
      onSubmit(trimmedLabel, trimmedCommand, category);
      onClose();
    }
  };

  const isValid = label.trim().length > 0 && command.trim().length > 0;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={mode === 'create' ? 'Create Recipe' : 'Edit Recipe'}
      size="lg"
      centered
      padding="lg"
      radius="md"
      styles={{
        header: { backgroundColor: 'var(--phantom-surface-card)', borderBottom: '1px solid var(--phantom-border-subtle)' },
        title: { color: 'var(--phantom-text-primary)', fontWeight: 600 },
        body: { backgroundColor: 'var(--phantom-surface-card)' },
        content: { backgroundColor: 'var(--phantom-surface-card)' },
      }}
    >
      <Stack gap="md">
        <TextInput
          label="Name"
          placeholder="e.g., Deploy Staging"
          value={label}
          onChange={(e) => setLabel(e.currentTarget.value)}
          autoFocus
          data-testid="recipe-name-input"
          styles={{
            label: { color: 'var(--phantom-text-secondary)', fontSize: '0.8rem' },
            input: {
              backgroundColor: 'var(--phantom-surface-elevated)',
              borderColor: 'var(--phantom-border-subtle)',
              color: 'var(--phantom-text-primary)',
            },
          }}
        />
        <TextInput
          label="Command"
          placeholder="e.g., npm run deploy:staging"
          value={command}
          onChange={(e) => setCommand(e.currentTarget.value)}
          data-testid="recipe-command-input"
          styles={{
            label: { color: 'var(--phantom-text-secondary)', fontSize: '0.8rem' },
            input: {
              backgroundColor: 'var(--phantom-surface-elevated)',
              borderColor: 'var(--phantom-border-subtle)',
              color: 'var(--phantom-text-primary)',
              fontFamily: "'JetBrains Mono', monospace",
            },
          }}
        />
        <Select
          label="Category"
          data={CATEGORY_OPTIONS}
          value={category}
          onChange={(val) => setCategory((val as CustomRecipe['category']) ?? 'custom')}
          data-testid="recipe-category-select"
          styles={{
            label: { color: 'var(--phantom-text-secondary)', fontSize: '0.8rem' },
            input: {
              backgroundColor: 'var(--phantom-surface-elevated)',
              borderColor: 'var(--phantom-border-subtle)',
              color: 'var(--phantom-text-primary)',
            },
          }}
        />
        <Group justify="flex-end" gap="xs" mt="sm">
          <Button variant="subtle" size="xs" onClick={onClose} color="gray">
            Cancel
          </Button>
          <Button
            size="xs"
            disabled={!isValid}
            onClick={handleSubmit}
            color="teal"
            data-testid="recipe-form-submit"
          >
            {mode === 'create' ? 'Create' : 'Save'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
