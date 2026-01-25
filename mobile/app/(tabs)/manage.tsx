import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View as RNView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { Text, View } from '@/components/Themed';
import { usePortfolio } from '@/context/PortfolioContext';
import Colors from '@/constants/Colors';
import { useAppTheme } from '@/context/ThemeContext';

type EditingState = {
  categoryId: string;
  assetId: string;
} | null;

type AssetOption = {
  name: string;
  symbol?: string;
};

const formatCurrency = (value: number, currency: string) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(value);

const ASSET_OPTIONS: Record<string, AssetOption[]> = {
  crypto: [
    { name: 'Bitcoin', symbol: 'BTC' },
    { name: 'Ethereum', symbol: 'ETH' },
    { name: 'Solana', symbol: 'SOL' },
    { name: 'BNB', symbol: 'BNB' },
    { name: 'XRP', symbol: 'XRP' },
    { name: 'USDT', symbol: 'USDT' },
    { name: 'USDC', symbol: 'USDC' },
  ],
  traditional: [
    { name: 'Tesouro Selic' },
    { name: 'CDB' },
    { name: 'LCI/LCA' },
    { name: 'Acoes B3', symbol: 'B3SA3' },
    { name: 'ETF BOVA11', symbol: 'BOVA11' },
    { name: 'FII HGLG11', symbol: 'HGLG11' },
  ],
};

export default function ManageScreen() {
  const { portfolio, isLoading, addAsset, updateAsset, removeAsset } = usePortfolio();
  const isWeb = Platform.OS === 'web';
  const { mode } = useAppTheme();
  const palette = Colors[mode ?? 'dark'];
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AssetOption | null>(null);
  const [invested, setInvested] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<EditingState>(null);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!selectedCategoryId && portfolio.categories.length > 0) {
      setSelectedCategoryId(portfolio.categories[0].id);
    }
  }, [portfolio.categories, selectedCategoryId]);

  const selectedCategory = portfolio.categories.find(
    (category) => category.id === selectedCategoryId
  );

  const orderedCategories = useMemo(
    () =>
      [...portfolio.categories].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [portfolio.categories]
  );

  const resetForm = () => {
    setSelectedAsset(null);
    setInvested('');
    setEditing(null);
    setError('');
    setShowAssetPicker(false);
    setSearchQuery('');
  };

  const handleSelectAsset = (option: AssetOption) => {
    setSelectedAsset(option);
    setError('');
    setShowAssetPicker(false);
    setSearchQuery('');
  };

  const handleSubmit = () => {
    if (!selectedCategoryId) return;
    if (!selectedAsset) {
      setError('Selecione um ativo.');
      return;
    }

    const normalized = invested.replace(',', '.').replace(/[^0-9.]/g, '');
    const amount = normalized ? Number(normalized) : 0;
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Informe um valor investido valido.');
      return;
    }

    if (editing) {
      updateAsset(editing.categoryId, editing.assetId, {
        name: selectedAsset.name,
        symbol: selectedAsset.symbol ?? undefined,
        invested: amount,
      });
    } else {
      addAsset(selectedCategoryId, {
        name: selectedAsset.name,
        symbol: selectedAsset.symbol ?? undefined,
        invested: amount,
      });
    }

    resetForm();
  };

  const startEditing = (categoryId: string, assetId: string) => {
    const category = portfolio.categories.find((item) => item.id === categoryId);
    const asset = category?.assets.find((item) => item.id === assetId);
    if (!asset) return;
    setSelectedCategoryId(categoryId);
    setSelectedAsset({ name: asset.name, symbol: asset.symbol });
    setInvested(asset.invested.toString().replace('.', ','));
    setEditing({ categoryId, assetId });
    setError('');
  };

  const suggestedAssets =
    selectedCategoryId === 'crypto'
      ? ASSET_OPTIONS.crypto
      : selectedCategoryId === 'traditional'
        ? ASSET_OPTIONS.traditional
        : [];

  const filteredAssets = suggestedAssets.filter((option) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      option.name.toLowerCase().includes(query) ||
      (option.symbol ? option.symbol.toLowerCase().includes(query) : false)
    );
  });

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <Text style={styles.subtitle}>Carregando portfolio...</Text>
      </View>
    );
  }

  return (
    <RNView key={mode} style={[styles.screen, isWeb ? styles.screenWeb : null]}>
      {/* visual limpo: sem glow */}
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Gerenciar ativos</Text>
        <Text style={styles.subtitle}>Adicione, edite ou remova ativos do portfólio</Text>

        <LinearGradient
          colors={['rgba(249, 115, 22, 0.45)', '#030712']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.gradientBorderLg}>
          <View style={styles.card}>
            <View style={styles.fieldGroup}>
          <Text style={styles.sectionTitle}>Categoria</Text>
          <View style={styles.categoryRow}>
            {orderedCategories.map((category) => {
              const active = category.id === selectedCategoryId;
              return (
                <Pressable
                  key={category.id}
                  onPress={() => setSelectedCategoryId(category.id)}
                  style={[styles.categoryChip, active ? styles.categoryChipActive : null]}>
                  <Text
                    style={[styles.categoryChipText, active ? styles.categoryChipTextActive : null]}>
                    {category.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.sectionTitle}>Ativo</Text>
              <LinearGradient
                colors={['rgba(249, 115, 22, 0.45)', '#030712']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.gradientBorderSm}>
                <Pressable
                  onPress={() => setShowAssetPicker((prev) => !prev)}
                  style={styles.inputSurface}>
                  <Text style={styles.assetSelectText}>
                    {selectedAsset
                      ? `${selectedAsset.name}${selectedAsset.symbol ? ` (${selectedAsset.symbol})` : ''}`
                      : 'Selecionar ativo'}
                  </Text>
                </Pressable>
              </LinearGradient>
            </View>
        <Modal
          visible={showAssetPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowAssetPicker(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setShowAssetPicker(false)}>
            <LinearGradient
              colors={['rgba(249, 115, 22, 0.45)', '#030712']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.gradientBorderLg}>
              <RNView style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  Selecionar ativo ({selectedCategoryId === 'crypto' ? 'Cripto' : 'Tradicional'})
                </Text>
                <Pressable onPress={() => setShowAssetPicker(false)}>
                  <Text style={styles.modalClose}>✕</Text>
                </Pressable>
              </View>
              <LinearGradient
                colors={['rgba(249, 115, 22, 0.45)', '#030712']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.gradientBorderSm}>
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Procurar ativo"
                  placeholderTextColor={palette.muted}
                  style={styles.searchInput}
                />
              </LinearGradient>
              <ScrollView style={styles.modalList}>
                {filteredAssets.map((option) => (
                  <Pressable
                    key={`${option.name}-${option.symbol ?? 'no-symbol'}`}
                    onPress={() => handleSelectAsset(option)}
                    style={styles.modalItem}>
                    <Text style={styles.modalItemName}>{option.name}</Text>
                    {option.symbol ? (
                      <Text style={styles.modalItemSymbol}>{option.symbol}</Text>
                    ) : null}
                  </Pressable>
                ))}
                {filteredAssets.length === 0 ? (
                  <Text style={styles.modalEmpty}>Nenhum ativo encontrado.</Text>
                ) : null}
              </ScrollView>
              </RNView>
            </LinearGradient>
          </Pressable>
        </Modal>

        <View style={styles.fieldGroup}>
          <Text style={styles.sectionTitle}>Valor investido</Text>
          <LinearGradient
            colors={['rgba(249, 115, 22, 0.45)', '#030712']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.gradientBorderSm}>
            <TextInput
              value={invested}
              onChangeText={setInvested}
              placeholder="Ex: 1250,50 (opcional)"
              style={styles.input}
              placeholderTextColor={palette.muted}
              keyboardType="decimal-pad"
            />
          </LinearGradient>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.actionsRow}>
          <Pressable style={styles.primaryButton} onPress={handleSubmit}>
            <LinearGradient
              colors={[palette.accent, palette.accentAlt]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.primaryButtonGradient}>
              <Text style={styles.primaryButtonText}>{editing ? 'Salvar' : 'Adicionar'}</Text>
            </LinearGradient>
          </Pressable>
          {editing ? (
            <Pressable style={styles.secondaryButton} onPress={resetForm}>
              <Text style={styles.secondaryButtonText}>Cancelar</Text>
            </Pressable>
          ) : null}
        </View>
          </View>
        </LinearGradient>

        {portfolio.categories.map((category) => (
          <LinearGradient
            key={category.id}
            colors={['rgba(249, 115, 22, 0.45)', '#030712']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.gradientBorderLg}>
            <View style={styles.listCard}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>{category.name}</Text>
              <Text style={styles.sectionMeta}>
                {formatCurrency(
                  category.assets.reduce((sum, asset) => sum + asset.invested, 0),
                  portfolio.currency
                )}
              </Text>
            </View>
            {category.assets.length === 0 ? (
              <Text style={styles.emptyText}>Sem ativos cadastrados.</Text>
            ) : (
              category.assets.map((asset) => (
                <View key={asset.id} style={styles.assetRow}>
                  <View style={styles.assetInfo}>
                    <Text style={styles.assetName}>{asset.name}</Text>
                    <Text style={styles.assetMeta}>
                      {asset.symbol ? `${asset.symbol} · ` : ''}
                      {formatCurrency(asset.invested, portfolio.currency)}
                    </Text>
                  </View>
                  <View style={styles.assetActions}>
                    <Pressable
                      style={[styles.smallButton, styles.smallButtonEdit]}
                      onPress={() => startEditing(category.id, asset.id)}>
                      <Text style={styles.smallButtonText}>Editar</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.smallButton, styles.smallButtonDelete]}
                      onPress={() => removeAsset(category.id, asset.id)}>
                      <Text style={styles.smallButtonText}>Excluir</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
            </View>
          </LinearGradient>
        ))}
      </ScrollView>
    </RNView>
  );
}

const createStyles = (palette: typeof Colors.dark) =>
  StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.background,
  },
  screenWeb: {
    paddingLeft: 140,
    paddingTop: 12,
    paddingRight: 12,
    paddingBottom: 12,
  },
  container: {
    backgroundColor: palette.background,
  },
  content: {
    padding: 20,
    gap: 16,
    backgroundColor: palette.background,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: palette.text,
  },
  subtitle: {
    fontSize: 13,
    color: palette.muted,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: palette.background,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: palette.background,
    overflow: 'hidden',
    gap: 16,
  },
  gradientBorderLg: {
    borderRadius: 18,
    padding: 3,
  },
  gradientBorderSm: {
    borderRadius: 12,
    padding: 3,
  },
  inputSurface: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: palette.background,
  },
  fieldGroup: {
    gap: 8,
  },
  cardAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: palette.text,
  },
  sectionMeta: {
    fontSize: 13,
    color: palette.muted,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: 'rgba(249, 115, 22, 0.08)',
  },
  categoryChipActive: {
    backgroundColor: palette.accent,
    borderColor: palette.accent,
  },
  categoryChipText: {
    fontSize: 12,
    color: palette.text,
  },
  categoryChipTextActive: {
    color: '#0b0f1a',
    fontWeight: '600',
  },
  input: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: palette.text,
    backgroundColor: palette.background,
  },
  error: {
    color: palette.danger,
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  assetSelectButton: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: palette.background,
  },
  assetSelectText: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.8)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    borderRadius: 16,
    backgroundColor: palette.background,
    padding: 16,
    maxHeight: '70%',
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.text,
  },
  modalClose: {
    fontSize: 18,
    color: palette.muted,
  },
  searchInput: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: palette.text,
    backgroundColor: palette.background,
  },
  modalList: {
    flexGrow: 0,
  },
  modalItem: {
    paddingVertical: 10,
    borderBottomWidth: 0,
  },
  modalItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.text,
  },
  modalItemSymbol: {
    fontSize: 12,
    color: palette.muted,
    marginTop: 2,
  },
  modalEmpty: {
    fontSize: 12,
    color: palette.muted,
    paddingVertical: 12,
    textAlign: 'center',
  },
  primaryButton: {
    borderRadius: 10,
    overflow: 'hidden',
  },
  primaryButtonGradient: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#0b0f1a',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  secondaryButton: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.background,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.text,
  },
  listCard: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: palette.background,
    overflow: 'hidden',
    gap: 10,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emptyText: {
    fontSize: 12,
    color: palette.muted,
    paddingVertical: 6,
  },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(125, 211, 252, 0.35)',
  },
  assetInfo: {
    flex: 1,
    marginRight: 12,
  },
  assetName: {
    fontSize: 14,
    fontWeight: '600',
    color: palette.text,
  },
  assetMeta: {
    fontSize: 12,
    color: palette.muted,
    marginTop: 2,
  },
  assetActions: {
    flexDirection: 'row',
    gap: 8,
  },
  assetPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  assetChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: 'rgba(249, 115, 22, 0.12)',
  },
  assetChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.text,
  },
  smallButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  smallButtonEdit: {
    backgroundColor: 'rgba(249, 115, 22, 0.2)',
  },
  smallButtonDelete: {
    backgroundColor: 'rgba(248, 113, 113, 0.2)',
  },
  smallButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.text,
  },
  });
