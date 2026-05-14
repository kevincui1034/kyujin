import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Placeholder home screen. The real iOS app fills in after the web MVP
// validates classification on real inboxes — see PLANNING.md timeline.
export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.title}>Kyujin</Text>
        <Text style={styles.subtitle}>Job application tracker</Text>
        <Text style={styles.body}>
          Open the web app at /app to manage applications. The mobile experience is coming after
          the classifier is validated on real inboxes.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 36, fontWeight: '600' },
  subtitle: { marginTop: 4, color: '#666' },
  body: { marginTop: 24, textAlign: 'center', color: '#444', lineHeight: 22 },
});
