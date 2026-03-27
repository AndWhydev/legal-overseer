import { View, Text, StyleSheet } from 'react-native';

export default function ApprovalsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Approvals</Text>
      <Text style={styles.placeholder}>Approvals coming in Plan 03</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  placeholder: {
    fontSize: 16,
    color: '#666',
  },
});
