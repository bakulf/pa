import { AppLoading } from 'expo';
import { Asset } from 'expo-asset';
import * as Font from 'expo-font';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  AsyncStorage,
  Button,
  KeyboardAvoidingView,
  StyleSheet,
  ScrollView,
  Text,
  TextInput,
  View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GiftedChat } from 'react-native-gifted-chat'

import { Notifications } from 'expo';
import * as Permissions from 'expo-permissions';

const ENDPOINT = 'https://pucci.thembi.me';

const USERS = [
  { _id: 1,
    name: 'Tizzi',
    avatar: 'https://placeimg.com/140/140/any',
  },
  { _id: 2,
    name: 'Baku',
    avatar: 'https://placeimg.com/140/140/any',
  },
];

export default class App extends React.Component {
  state = {
    state: 'loading',
    token: null,
    warningMessage: null,
    username: null,
    password: null,
    messages: [],
    userId: null,
  }

  constructor(props) {
    super(props);
  }

  componentDidMount() {
    this._notificationSubscription = Notifications.addListener(async notification => {
      if (AppState.currentState === 'active') {
        Notifications.dismissAllNotificationsAsync();
      }

      this.fetchMessages(this.state.token, this.state.messages);
    });

    AppState.addEventListener('change', this.handleAppStateChange);
  }

  componentWillUnmount() {
    this._notificationSubscription.remove();
    AppState.removeEventListener('change', this.handleAppStateChange);
  }

  handleAppStateChange = nextAppState => {
    if (nextAppState === 'active') {
      Notifications.dismissAllNotificationsAsync();
    }
  };

  async appendMessages(newMessages) {
    newMessages.forEach(message => {
      message.user = USERS.find(u => u._id === message.user._id);
    });

    const messages = GiftedChat.append(this.state.messages, newMessages);
    this.setState({messages})

    await AsyncStorage.setItem("messages", JSON.stringify(messages));
    const messageStr = await AsyncStorage.getItem('messages');
  }

  async onSend(messages = []) {
    await this.appendMessages(messages);

    let resp;
    try {
      resp = await fetch(ENDPOINT + '/push', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: this.state.token,
          messages,
        }),
      });
    } catch (e) {
      this.setState({state: 'login', warningMessage: "Failed to contact the host"});
      return;
    }
  }

  render() {
    switch (this.state.state) {
      case 'loading':
        if (!this.props.skipLoadingScreen) {
          return (
            <AppLoading
              startAsync={() => this.loadResourcesAsync()}
              onError={error => console.error(error)}
              onFinish={() => {
                this.setState({state: !this.state.token ? 'login' : 'authenticating'});
              }}
            />
          );
        }

      case 'login':
        let warningView;
        if (this.state.warningMessage) {
          warningView = <Text style={styles.warning}>{this.state.warningMessage}</Text>
        }

        return (
          <ScrollView
            style={styles.container}
            contentContainerStyle={styles.contentContainer}>
            <View style={styles.welcomeContainer}>
              <Text style={styles.welcomeLogo}>💋</Text>
              <Text style={styles.welcomeText}>PucciApp!</Text>
            </View>

            <View style={styles.formContainer}>
              <Text style={styles.formLabel}>Login</Text>
              <TextInput style={styles.formInput}
                textContentType="username"
                onChangeText={text => this.setState({username: text})}
                value={this.state.username} />
              <Text style={styles.formLabel}>Password</Text>
              <TextInput style={styles.formInput}
                textContentType="password"
                secureTextEntry={true}
                onChangeText={text => this.setState({password: text})}
                value={this.state.password} />
              <View style={styles.formButton}>
                <Button title="Let's go!" onPress={() => this.login()} />
              </View>
              { Platform.OS === 'android' && <KeyboardAvoidingView behavior="padding" /> }
            </View>

            {warningView}
          </ScrollView>
        );

      case 'authenticating':
        this.authenticating();
        return (
          <ScrollView
            style={styles.container}
            contentContainerStyle={styles.contentContainer}>
            <View style={styles.welcomeContainer}>
              <Text style={styles.welcomeLogo}>💋</Text>
              <Text style={styles.welcomeText}>PucciApp!</Text>
            </View>

            <ActivityIndicator size="large" color="#0000ff" />
          </ScrollView>
        );

      case 'ready':
        return (
          <View style={styles.container}>
            <View style={styles.topContainer}>
              <Text style={styles.topText}>PucciApp!</Text>
              <Text style={styles.topLogo}>💋</Text>
            </View>
            <GiftedChat
              messages={this.state.messages}
              onSend={messages => this.onSend(messages)}
              user={{
                _id: this.state.userId,
              }}
            />
            { Platform.OS === 'android' && <KeyboardAvoidingView behavior="padding" /> }
          </View>
        );
    }
  }


  async login() {
    if (!this.state.username || !this.state.password) {
      this.setState({warningMessage: "Username and password required!"});
      return;
    }

    this.setState({state: 'authenticating', warningMessage: null});
  }

  async authenticating() {
    const { status: existingStatus } = await Permissions.getAsync(
      Permissions.NOTIFICATIONS
    );
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Permissions.askAsync(Permissions.NOTIFICATIONS);
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      this.setState({state: 'login', warningMessage: "Not enough permissions to continue"});
      return;
    }

    let token;
    try {
      token = await Notifications.getExpoPushTokenAsync();
    } catch (e) {
      this.setState({state: 'login', warningMessage: "Failed to obtain unique ID"});
      return;
    }

    let resp;
    try {
      resp = await fetch(ENDPOINT + '/token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: this.state.username,
          password: this.state.password,
          token,
          lastMessage: 0,
        }),
      });
    } catch (e) {
      this.setState({state: 'login', warningMessage: "Failed to contact the host"});
      return;
    }

    if (!resp || resp.status !== 200) {
      this.setState({state: 'login', warningMessage: "The server doesn't love you."});
      return;
    }

    await AsyncStorage.setItem("token", token);

    const data = await resp.json();
    if (Array.isArray(data.messages) && data.messages.length > 0) {
      await this.appendMessages(data.messages);
    }

    this.setState({
      token,
      userId: data.userId,
      state: 'ready',
      password: null,
    });
  }

  async fetchMessages(token, messages) {
    let lastMessage = 0;
    if (messages.length) {
      lastMessage = messages[messages.length - 1].createdAt;
    }

    let resp;
    try {
      resp = await fetch(ENDPOINT + '/token', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          lastMessage,
        }),
      });
    } catch (e) {
      return;
    }

    if (!resp || resp.status !== 200) {
      return;
    }

    const data = await resp.json();
    if (Array.isArray(data.messages) && data.messages.length > 0) {
      await this.appendMessages(data.messages);
    }

    this.setState({
      token,
      userId: data.userId,
      state: 'ready'
    });
  }

  async loadResourcesAsync() {
    const token = await AsyncStorage.getItem('token');
    if (!token) {
      return;
    }

    const messageStr = await AsyncStorage.getItem('messages');
    const messages = JSON.parse(messageStr || "[]");

    this.fetchMessages(token, messages);
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  contentContainer: {
    paddingTop: 30,
  },
  welcomeContainer: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  welcomeLogo: {
    marginTop: 3,
    marginLeft: -10,
    fontSize: 100,
  },
  welcomeText: {
    marginTop: 3,
    marginLeft: -10,
    fontSize: 30,
  },
  formContainer: {
    margin: 20,
  },
  formLabel: {
    marginTop: 20,
  },
  formInput: {
    borderWidth: 1,
  },
  formButton: {
    marginTop: 40,
    color: '#ccc',
  },
  warning: {
    margin: 20,
    color: 'red',
  },
  topContainer: {
    flexDirection: 'row',
    backgroundColor: '#ccc',
  },
  topLogo: {
    marginTop: 35,
    marginBottom: 15,
    marginRight: 20,
    fontSize: 20,
  },
  topText: {
    marginTop: 35,
    marginBottom: 15,
    marginLeft: 20,
    fontSize: 20,
    flex: 1,
    marginRight: 20,
  },
});
