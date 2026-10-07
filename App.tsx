import React, { useCallback, useRef, useState, useEffect } from 'react';
import { FlatList, StyleSheet, View, Keyboard } from 'react-native';
import { Provider as PaperProvider, Button, Divider, List, Text, TextInput, ActivityIndicator } from 'react-native-paper';
import { NavigationContainer, useFocusEffect } from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackScreenProps } from '@react-navigation/native-stack';
import MapView, { Marker, Region } from 'react-native-maps';
import * as SQLite from 'expo-sqlite';

const GEOCODE_API_KEY = '6aa9223a59369402686223uqydfa22c';

type GeocodeResult = { lat: string; lon: string; display_name: string };

async function geocodeAddress(
  address: string
): Promise<{ latitude: number; longitude: number } | null> {
  const url = `https://geocode.maps.co/search?q=${encodeURIComponent(
    address
  )}&api_key=${GEOCODE_API_KEY}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Geocoding failed: ${response.status}`);
  const results: GeocodeResult[] = await response.json();
  if (!Array.isArray(results) || results.length === 0) return null;
  return {
    latitude: parseFloat(results[0].lat),
    longitude: parseFloat(results[0].lon),
  };
}

type Place = { id: number; address: string };

const db = SQLite.openDatabaseSync('places.db');
db.execSync(
  'CREATE TABLE IF NOT EXISTS places (id INTEGER PRIMARY KEY AUTOINCREMENT, address TEXT NOT NULL);'
);

const getPlaces = (): Place[] =>
  db.getAllSync<Place>('SELECT id, address FROM places ORDER BY id;');

const addPlace = (address: string) =>
  db.runSync('INSERT INTO places (address) VALUES (?);', address);

const deletePlace = (id: number) =>
  db.runSync('DELETE FROM places WHERE id = ?;', id);


type RootStackParamList = {
  Places: undefined;
  Map: { address: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();


function PlacesScreen({
  navigation,
}: NativeStackScreenProps<RootStackParamList, 'Places'>) {
  const [address, setAddress] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);

  const reload = useCallback(() => setPlaces(getPlaces()), []);

  useFocusEffect(reload);

  const handleSave = () => {
    const trimmed = address.trim();
    if (!trimmed) return;
    addPlace(trimmed);
    setAddress('');
    Keyboard.dismiss();
    reload();
  };

  const handleDelete = (id: number) => {
    deletePlace(id);
    reload();
  };

  return (
    <View style={styles.container}>
      <View style={styles.form}>
        <TextInput
          label="PLACEFINDER"
          placeholder="Type in address"
          value={address}
          onChangeText={setAddress}
          mode="flat"
          dense
          style={styles.input}
          onSubmitEditing={handleSave}
          returnKeyType="done"
        />
        <Button
          icon="content-save"
          mode="contained"
          onPress={handleSave}
          disabled={!address.trim()}
          style={styles.saveButton}
        >
          SAVE
        </Button>
      </View>

      <FlatList
        data={places}
        keyExtractor={(item) => item.id.toString()}
        ItemSeparatorComponent={Divider}
        ListFooterComponent={places.length ? Divider : null}
        renderItem={({ item }) => (
          <List.Item
            title={item.address}
            onPress={() => navigation.navigate('Map', { address: item.address })}
            onLongPress={() => handleDelete(item.id)}
            right={() => (
              <View style={styles.rightContainer}>
                <Text style={styles.showOnMap}>show on map</Text>
                <List.Icon icon="chevron-right" />
              </View>
            )}
          />
        )}
      />
    </View>
  );
}

const DEFAULT_REGION: Region = {
  latitude: 60.1699,
  longitude: 24.9384,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

function MapScreen({
  route,
}: NativeStackScreenProps<RootStackParamList, 'Map'>) {
  const { address } = route.params;
  const mapRef = useRef<MapView>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await geocodeAddress(address);
        if (cancelled) return;
        if (!result) {
          setError('Address not found');
          setRegion(DEFAULT_REGION);
        } else {
          setRegion({
            latitude: result.latitude,
            longitude: result.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          });
        }
      } catch {
        if (!cancelled) {
          setError('Could not look up address');
          setRegion(DEFAULT_REGION);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const handleShow = () => {
    if (region) mapRef.current?.animateToRegion(region, 500);
  };

  if (loading || !region) {
    return (
      <View style={styles.center}>
        <ActivityIndicator animating size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView ref={mapRef} style={styles.map} initialRegion={region}>
        {!error && (
          <Marker
            coordinate={{ latitude: region.latitude, longitude: region.longitude }}
            title={address}
          />
        )}
      </MapView>
      {error && <Text style={styles.error}>{error}</Text>}
      <Button
        mode="contained"
        onPress={handleShow}
        style={styles.showButton}
        contentStyle={styles.showButtonContent}
        labelStyle={styles.showButtonLabel}
      >
        SHOW
      </Button>
    </View>
  );
}

export default function App() {
  return (
    <PaperProvider>
      <NavigationContainer>
        <Stack.Navigator initialRouteName="Places">
          <Stack.Screen
            name="Places"
            component={PlacesScreen}
            options={{ title: 'My Places' }}
          />
          <Stack.Screen name="Map" component={MapScreen} options={{ title: 'Map' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  container:{ 
    flex: 1, 
    backgroundColor: '#fff' 
  }, center: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center' 
  }, form: { 
    padding: 12 
  }, input: { 
    backgroundColor: 'transparent', 
    marginBottom: 12 
  }, saveButton: { 
    borderRadius: 2, 
    backgroundColor: '#9e9e9e' 
  }, rightContainer: { 
    flexDirection: 'row', 
    alignItems: 'center' 
  }, showOnMap: { 
    fontSize: 12, 
    color: '#9e9e9e' 
  }, map: { 
    flex: 1 
  }, showButton: { 
    borderRadius: 0, 
    backgroundColor: '#2196F3' 
  }, showButtonContent: { 
    height: 48 
  }, showButtonLabel: { 
    fontSize: 12, 
    fontWeight: 'bold', 
    letterSpacing: 1 
  }, error: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
});